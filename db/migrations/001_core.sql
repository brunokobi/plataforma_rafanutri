-- Núcleo multi-tenant (RN-004, RN-007, RN-200). Usuários vêm do Directus (directus_users).
-- O isolamento entre organizações é feito pelas permissões do Directus (scripts/directus-bootstrap.mjs);
-- as regras de negócio que não podem ser contornadas ficam em gatilhos aqui.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists citext;

create or replace function unaccent_immutable(text) returns text
language sql immutable parallel safe strict
as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

create or replace function slugify(value text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(unaccent_immutable(value)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(120) not null check (char_length(name) >= 2),
  slug        varchar(80) not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  type        varchar(16) not null default 'solo' check (type in ('solo', 'clinic', 'company')),
  document    varchar(20),
  logo        uuid references directus_files(id) on delete set null,
  brand_color varchar(7) not null default '#2E7D32' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger organizations_updated_at before update on organizations
  for each row execute function set_updated_at();

-- Dados profissionais do usuário (1:1 com directus_users).
create table profiles (
  id                     uuid primary key references directus_users(id) on delete cascade,
  full_name              varchar(160) not null default '',
  crn                    varchar(20),
  crn_region             varchar(10),
  phone                  varchar(20),
  terms_version_accepted varchar(20),
  terms_accepted_at      timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references directus_users(id) on delete cascade,
  role            varchar(16) not null check (role in ('owner', 'nutritionist', 'assistant')),
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on organization_members (user_id);

create table organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email           citext not null,
  role            varchar(16) not null check (role in ('nutritionist', 'assistant')),
  token_hash      char(64) not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  invited_by      uuid not null references directus_users(id),
  created_at      timestamptz not null default now()
);
create index organization_invites_org_idx on organization_invites (organization_id);

-- Planos (RN-200). A Fase 2 acrescenta preços e cobrança.
create table plans (
  code                varchar(32) primary key,
  name                varchar(60) not null,
  max_active_patients int check (max_active_patients is null or max_active_patients > 0),
  max_members         int check (max_members is null or max_members > 0),
  features            jsonb not null default '{}',
  is_public           boolean not null default true
);
insert into plans (code, name, max_active_patients, max_members, features) values
  ('free', 'Gratuito', 20, 1, '{"modules": ["clinical"], "patient_area": true, "ai_daily_quota": 5}');

create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  plan_code       varchar(32) not null references plans(code),
  status          varchar(16) not null default 'active',
  started_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on subscriptions
  for each row execute function set_updated_at();

create table plan_waitlist (
  organization_id uuid primary key references organizations(id) on delete cascade,
  user_id         uuid not null references directus_users(id),
  reason          varchar(40),
  created_at      timestamptz not null default now()
);

-- Organização nunca fica sem owner (exceto quando a própria organização é apagada).
create or replace function protect_last_owner() returns trigger
language plpgsql as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from organizations where id = old.organization_id)
     and (select count(*) from organization_members
          where organization_id = old.organization_id and role = 'owner') <= 1 then
    raise exception 'LAST_OWNER' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger organization_members_last_owner
  before update or delete on organization_members
  for each row execute function protect_last_owner();

-- Limite de membros do plano (o owner fundador sempre entra).
create or replace function enforce_member_limit() returns trigger
language plpgsql as $$
declare
  v_limit int;
begin
  select p.max_members into v_limit
  from subscriptions s join plans p on p.code = s.plan_code
  where s.organization_id = new.organization_id;
  perform pg_advisory_xact_lock(hashtext('members:' || new.organization_id::text));
  if v_limit is not null and
     (select count(*) from organization_members where organization_id = new.organization_id) >= v_limit then
    raise exception 'MEMBER_LIMIT_REACHED' using errcode = 'P0001', detail = format('limit=%s', v_limit);
  end if;
  return new;
end $$;
create trigger organization_members_limit
  before insert on organization_members
  for each row when (new.role <> 'owner')
  execute function enforce_member_limit();

/** Cria organização + owner + plano gratuito numa transação. Chamada pelo endpoint do Directus. */
create or replace function create_organization(p_user uuid, p_name text, p_type text default 'solo', p_brand_color text default '#2E7D32')
returns organizations
language plpgsql as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
  v_org  organizations;
begin
  v_base := coalesce(nullif(slugify(p_name), ''), 'consultorio');
  v_slug := v_base;
  while exists (select 1 from organizations where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into organizations (name, slug, type, brand_color)
  values (p_name, v_slug, p_type, p_brand_color)
  returning * into v_org;
  insert into organization_members (organization_id, user_id, role) values (v_org.id, p_user, 'owner');
  insert into subscriptions (organization_id, plan_code) values (v_org.id, 'free');
  return v_org;
end $$;
