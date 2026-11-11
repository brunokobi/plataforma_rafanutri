-- RN-004 — Organizações (consultórios), membros, perfil profissional e planos.
-- Usuários são os do Directus (directus_users). Idempotente.
-- Regras invioláveis ficam em gatilhos (ADR 0008, regra 3): último owner e limite de membros do plano.

begin;

create table if not exists plans (
  code                text primary key,              -- free, pro, ...
  name                text not null,
  max_active_patients integer,                       -- null = sem limite
  max_members         integer,                       -- null = sem limite
  price_cents         integer not null default 0
);

insert into plans (code, name, max_active_patients, max_members, price_cents) values
  ('free', 'Gratuito', 20, 1, 0)
on conflict (code) do update set
  name = excluded.name, max_active_patients = excluded.max_active_patients,
  max_members = excluded.max_members, price_cents = excluded.price_cents;

create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  slug        text not null unique,
  type        text not null default 'solo' check (type in ('solo', 'clinic', 'company')),
  brand_color text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo        uuid references directus_files (id) on delete set null,
  plan        text not null default 'free' references plans (code),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create table if not exists organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references directus_users (id) on delete cascade,
  role            text not null check (role in ('owner', 'nutritionist', 'assistant')),
  created_at      timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

create index if not exists organization_members_user_id on organization_members (user_id);

-- Dados profissionais do usuário (CRN). Um por usuário.
create table if not exists professional_profiles (
  user_id    uuid primary key references directus_users (id) on delete cascade,
  crn        text check (crn ~ '^\d{1,6}$'),
  crn_region text check (crn_region ~ '^CRN-([1-9]|1[01])$'),
  updated_at timestamptz
);

-- A base de alimentos já previa organization_id; agora a FK pode existir.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'foods_organization_id_fkey') then
    alter table foods add constraint foods_organization_id_fkey
      foreign key (organization_id) references organizations (id) on delete cascade;
  end if;
end $$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists organizations_updated_at on organizations;
create trigger organizations_updated_at before update on organizations
  for each row execute function set_updated_at();

-- Slug único a partir do nome: "Clínica Nutri Bem" -> "clinica-nutri-bem", "-2", "-3"...
create or replace function unique_org_slug(p_name text) returns text language plpgsql as $$
declare base text; candidate text; n int := 1;
begin
  base := trim(both '-' from regexp_replace(lower(f_unaccent(p_name)), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'consultorio'; end if;
  base := left(base, 60);
  candidate := base;
  while exists (select 1 from organizations where slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- Toda organização precisa de ao menos um owner.
create or replace function protect_last_owner() returns trigger language plpgsql as $$
declare org uuid := coalesce(old.organization_id, new.organization_id);
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner' or new.organization_id <> old.organization_id) then
    -- A organização inteira sendo apagada (cascade) pode remover o último owner.
    if not exists (select 1 from organizations where id = old.organization_id) then
      return coalesce(new, old);
    end if;
    if not exists (select 1 from organization_members
                   where organization_id = old.organization_id and role = 'owner' and id <> old.id) then
      raise exception 'A organização precisa de ao menos um owner' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists organization_members_last_owner on organization_members;
create trigger organization_members_last_owner before update or delete on organization_members
  for each row execute function protect_last_owner();

-- Limite de membros do plano (o gratuito permite 1).
create or replace function enforce_member_limit() returns trigger language plpgsql as $$
declare lim int; total int;
begin
  select p.max_members into lim from organizations o join plans p on p.code = o.plan where o.id = new.organization_id;
  if lim is null then return new; end if;
  perform 1 from organizations where id = new.organization_id for update;  -- serializa inserções concorrentes
  select count(*) into total from organization_members where organization_id = new.organization_id;
  if total >= lim then
    raise exception 'O plano permite no máximo % membro(s)', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists organization_members_limit on organization_members;
create trigger organization_members_limit before insert on organization_members
  for each row execute function enforce_member_limit();

-- Cria organização + owner + perfil profissional numa transação (chamada pelo endpoint
-- POST /rafanutri/organizations). Idempotente por usuário: se ele já é owner de uma
-- organização, devolve essa em vez de criar outra (duplo clique, reenvio).
create or replace function create_organization(
  p_user_id uuid, p_name text, p_type text, p_brand_color text, p_crn text, p_crn_region text
) returns organizations language plpgsql as $$
declare org organizations;
begin
  perform 1 from directus_users where id = p_user_id for update;
  select o.* into org from organizations o
    join organization_members m on m.organization_id = o.id
    where m.user_id = p_user_id and m.role = 'owner'
    order by o.created_at limit 1;
  if found then return org; end if;

  insert into organizations (name, slug, type, brand_color)
    values (trim(p_name), unique_org_slug(p_name), p_type, p_brand_color)
    returning * into org;
  insert into organization_members (organization_id, user_id, role) values (org.id, p_user_id, 'owner');
  insert into professional_profiles (user_id, crn, crn_region, updated_at)
    values (p_user_id, p_crn, p_crn_region, now())
    on conflict (user_id) do update set crn = excluded.crn, crn_region = excluded.crn_region, updated_at = now();
  return org;
end $$;

insert into schema_migrations (version) values ('0002_organizations') on conflict do nothing;

commit;
