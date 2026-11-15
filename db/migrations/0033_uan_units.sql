-- RN-121/RN-122 — Base do módulo UAN: módulos por organização, contrato, unidades produtoras e equipe por unidade.
-- Idempotente.
--
-- Decisões (ver docs/modulos/uan.md e docs/pesquisa/uan-discovery.md):
-- - O módulo é habilitado por organização em organizations.modules (no MVP, pelo admin da plataforma, por SQL).
-- - A equipe da UAN (RT, cozinheiro, estoquista, auditor, gestor) fica SÓ em unit_members, nunca em
--   organization_members: assim nenhuma regra clínica ou financeira (que olha organization_members) a alcança.
-- - O owner da organização vê e administra todas as unidades; os demais só as unidades em que têm papel.
-- - Tabelas sem permissão no Directus: tudo passa pelos endpoints /rafanutri/uan/* da extensão.
-- - Limite de unidades ativas = unidades do contrato vigente (sem contrato: 1, para o piloto).

begin;

alter table organizations add column if not exists modules text[] not null default '{clinical}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_modules_check') then
    alter table organizations add constraint organizations_modules_check
      check (modules <@ '{clinical,uan}' and cardinality(modules) >= 1);
  end if;
end $$;

create or replace function org_has_module(p_org uuid, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_module = any (modules) from organizations where id = p_org), false);
$$;

create table if not exists organization_contracts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete cascade,
  plan                text not null check (plan in ('uan_pilot', 'uan_quality', 'uan_complete')),
  units_contracted    integer not null check (units_contracted between 1 and 1000),
  monthly_price_cents integer not null default 0 check (monthly_price_cents >= 0),
  starts_at           date not null default current_date,
  ends_at             date check (ends_at is null or ends_at >= starts_at),
  features            jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  created_at          timestamptz not null default now()
);
create index if not exists organization_contracts_org on organization_contracts (organization_id, starts_at desc);

/** Unidades ativas permitidas: o contrato vigente de maior número de unidades; sem contrato, 1. */
create or replace function uan_unit_limit(p_org uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(max(units_contracted), 1) from organization_contracts
  where organization_id = p_org and starts_at <= current_date and (ends_at is null or ends_at >= current_date);
$$;

create table if not exists production_units (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations (id) on delete cascade,
  name                        text not null check (char_length(btrim(name)) between 2 and 120),
  kind                        text not null default 'restaurant'
                                check (kind in ('industrial', 'hospital', 'school', 'hotel', 'restaurant', 'catering', 'other')),
  cnpj                        text check (cnpj is null or cnpj ~ '^\d{14}$'),
  address                     text check (address is null or char_length(address) <= 300),
  city                        text check (city is null or char_length(city) <= 120),
  state                       text check (state is null or state ~ '^[A-Z]{2}$'),
  geo_lat                     numeric(9, 6) check (geo_lat is null or geo_lat between -90 and 90),
  geo_lng                     numeric(9, 6) check (geo_lng is null or geo_lng between -180 and 180),
  geo_radius_m                integer not null default 200 check (geo_radius_m between 20 and 5000),
  sanitary_license            text check (sanitary_license is null or char_length(sanitary_license) <= 80),
  sanitary_license_expires_at date,
  active                      boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,
  check ((geo_lat is null) = (geo_lng is null))
);
create index if not exists production_units_org on production_units (organization_id, active, name);

create table if not exists unit_members (
  unit_id    uuid not null references production_units (id) on delete cascade,
  user_id    uuid not null references directus_users (id) on delete cascade,
  role       text not null check (role in ('technical_lead', 'manager', 'cook', 'stock_keeper', 'auditor')),
  created_at timestamptz not null default now(),
  primary key (unit_id, user_id, role)
);
create index if not exists unit_members_user on unit_members (user_id);

/** Papel do usuário na unidade: o owner da organização tem todos; os demais, os de unit_members. */
create or replace function has_unit_role(p_unit uuid, p_user uuid, p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from production_units u
    join organization_members m on m.organization_id = u.organization_id and m.user_id = p_user and m.role = 'owner'
    where u.id = p_unit
  ) or exists (
    select 1 from unit_members um
    where um.unit_id = p_unit and um.user_id = p_user and (p_roles is null or um.role = any (p_roles))
  );
$$;

-- Regras das unidades: módulo habilitado, limite de ativas, organização imutável.
create or replace function production_units_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'A unidade não muda de organização.' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;
  if not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização.' using errcode = 'check_violation';
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_advisory_xact_lock(hashtext('production_units:' || new.organization_id::text));
    if (select count(*) from production_units where organization_id = new.organization_id and active and id <> new.id)
       >= uan_unit_limit(new.organization_id) then
      raise exception 'Limite de unidades ativas do contrato atingido.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists production_units_guard on production_units;
create trigger production_units_guard before insert or update on production_units
  for each row execute function production_units_guard();

-- Uma unidade tem no máximo um RT (nutricionista responsável técnico).
create unique index if not exists unit_members_one_rt on unit_members (unit_id) where role = 'technical_lead';

-- Auditoria (RN-009): alterações nas unidades entram na trilha do consultório.
drop trigger if exists production_units_audit on production_units;
create trigger production_units_audit after insert or update or delete on production_units
  for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0033_uan_units') on conflict do nothing;

commit;
