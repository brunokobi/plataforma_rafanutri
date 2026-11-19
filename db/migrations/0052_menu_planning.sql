-- U7 — Perfis de público, regras de contrato e autonomia do cardápio (RN-221). Idempotente.
--
-- Decisões:
-- - Serviços e tipos de prato já estão no ciclo (menu_cycles.services e slots); aqui entram:
--   * `diner_profiles`: perfil de público (PAT, PNAE por etapa, hospitalar por dieta, hotelaria, transportada,
--     outro) com metas por refeição em jsonb {nutriente: {min, max, target}}. Perfis da plataforma
--     (organization_id null) são só leitura e marcados validated = false até a RT revisar; a empresa copia.
--   * `menu_rules`: regras do contrato (insumo ou categoria vetados, prato obrigatório por dia, frequência
--     máxima por semana, teto de custo por refeição), da empresa toda ou de um perfil.
--   * `menu_cycles.profile_id` e `autonomy` (padronizado, descentralizado, livre).
--   * `unit_sheet_adjustments`: ajuste local de per capita da ficha da rede, sem alterar a ficha.
-- - A avaliação das regras e da adequação fica no nutrition-core (motor de regras testado).

begin;

create table if not exists diner_profiles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  code            text check (code is null or code ~ '^[a-z0-9-]{2,60}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  segment         text not null check (segment in ('pat', 'pnae', 'hospital', 'hotel', 'transported', 'other')),
  stage           text check (stage is null or char_length(stage) <= 120),
  diet            text check (diet is null or char_length(diet) <= 120),
  services        text[] not null default '{lunch}'
                    check (cardinality(services) between 1 and 6 and services <@ '{breakfast,morning_snack,lunch,afternoon_snack,dinner,supper}'),
  targets         jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  reference       text check (reference is null or char_length(reference) <= 300),
  validated       boolean not null default false,
  copied_from     uuid references diner_profiles (id) on delete set null,
  active          boolean not null default true,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists diner_profiles_org on diner_profiles (organization_id, active);
create unique index if not exists diner_profiles_platform_code on diner_profiles (code) where organization_id is null;

-- Metas: cada chave é um objeto com min, max e/ou target numéricos.
create or replace function diner_targets_valid(t jsonb) returns boolean language sql immutable as $$
  select not exists (
    select 1 from jsonb_each(t) e
     where jsonb_typeof(e.value) <> 'object'
        or e.key !~ '^[a-z_]{2,40}$'
        or exists (select 1 from jsonb_each(e.value) x where x.key not in ('min', 'max', 'target') or jsonb_typeof(x.value) <> 'number')
        or ((e.value ? 'min') and (e.value ? 'max') and (e.value ->> 'min')::numeric > (e.value ->> 'max')::numeric)
  );
$$;

create or replace function diner_profiles_guard() returns trigger language plpgsql as $$
begin
  if current_setting('rafanutri.seed', true) = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.organization_id is null then raise exception 'Perfil da plataforma é só leitura' using errcode = 'P0001'; end if;
    return old;
  end if;
  if (tg_op = 'INSERT' and new.organization_id is null) or (tg_op = 'UPDATE' and old.organization_id is null) then
    raise exception 'Perfil da plataforma é só leitura; copie para a sua empresa' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'O perfil não muda de empresa' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' and not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  if not diner_targets_valid(new.targets) then
    raise exception 'Metas inválidas: use {nutriente: {min, max, target}}' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;
drop trigger if exists diner_profiles_guard on diner_profiles;
create trigger diner_profiles_guard before insert or update or delete on diner_profiles for each row execute function diner_profiles_guard();

/** Copia um perfil (da plataforma ou da própria empresa) para a empresa; nasce não validado. */
create or replace function diner_profile_copy(p_profile uuid, p_org uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p diner_profiles; nid uuid;
begin
  select * into p from diner_profiles where id = p_profile and active and (organization_id is null or organization_id = p_org);
  if p.id is null then raise exception 'Perfil indisponível' using errcode = 'P0001'; end if;
  insert into diner_profiles (organization_id, name, segment, stage, diet, services, targets, reference, validated, copied_from, created_by)
  values (p_org, left(p.name || case when p.organization_id is null then ' — personalizado' else ' (cópia)' end, 120),
          p.segment, p.stage, p.diet, p.services, p.targets, p.reference, false, p.id, p_user)
  returning id into nid;
  return nid;
end $$;

create table if not exists menu_rules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  profile_id      uuid references diner_profiles (id) on delete cascade,
  kind            text not null check (kind in ('vetoed_ingredient', 'vetoed_category', 'required_daily', 'max_per_week', 'cost_ceiling')),
  ingredient_id   uuid references ingredients (id) on delete cascade,
  sheet_category  text check (sheet_category is null or sheet_category in ('main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'base', 'other')),
  slot            text check (slot is null or slot in ('main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'other')),
  service         text check (service is null or service in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')),
  max_count       integer check (max_count is null or max_count between 0 and 50),
  cost_cents      integer check (cost_cents is null or cost_cents between 1 and 1000000),
  note            text check (note is null or char_length(note) <= 500),
  active          boolean not null default true,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (kind <> 'vetoed_ingredient' or ingredient_id is not null),
  check (kind <> 'vetoed_category' or sheet_category is not null),
  check (kind <> 'required_daily' or slot is not null),
  check (kind <> 'max_per_week' or (max_count is not null and (ingredient_id is not null or sheet_category is not null))),
  check (kind <> 'cost_ceiling' or cost_cents is not null)
);
create index if not exists menu_rules_org on menu_rules (organization_id, active, profile_id);

create or replace function menu_rules_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'A regra não muda de empresa' using errcode = 'P0001';
  end if;
  if not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  if new.profile_id is not null and not exists (select 1 from diner_profiles where id = new.profile_id and organization_id = new.organization_id) then
    raise exception 'Perfil de outra empresa' using errcode = 'P0001';
  end if;
  if new.ingredient_id is not null and not exists (select 1 from ingredients where id = new.ingredient_id and organization_id = new.organization_id) then
    raise exception 'Insumo de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists menu_rules_guard on menu_rules;
create trigger menu_rules_guard before insert or update on menu_rules for each row execute function menu_rules_guard();

alter table menu_cycles add column if not exists profile_id uuid references diner_profiles (id) on delete set null;
alter table menu_cycles add column if not exists autonomy text not null default 'free';
do $$ begin
  alter table menu_cycles add constraint menu_cycles_autonomy check (autonomy in ('standardized', 'decentralized', 'free'));
exception when duplicate_object then null; end $$;

create or replace function menu_cycles_profile_guard() returns trigger language plpgsql as $$
begin
  if new.profile_id is not null and (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id) and not exists (
    select 1 from diner_profiles p where p.id = new.profile_id and p.organization_id = (select organization_id from production_units where id = new.unit_id)
  ) then
    raise exception 'Perfil de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists menu_cycles_profile_guard on menu_cycles;
create trigger menu_cycles_profile_guard before insert or update of profile_id on menu_cycles for each row execute function menu_cycles_profile_guard();

create table if not exists unit_sheet_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  sheet_root_id   uuid not null references tech_sheets (id) on delete cascade,
  portion_factor  numeric(5, 3) not null default 1 check (portion_factor between 0.1 and 5),
  notes           text check (notes is null or char_length(notes) <= 500),
  updated_by      uuid references directus_users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (unit_id, sheet_root_id)
);

create or replace function unit_sheet_adjustments_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.unit_id <> old.unit_id or new.sheet_root_id <> old.sheet_root_id) then
    raise exception 'O ajuste não muda de unidade nem de ficha' using errcode = 'P0001';
  end if;
  new.organization_id := (select organization_id from production_units where id = new.unit_id);
  if not exists (select 1 from tech_sheets where id = new.sheet_root_id and root_id = new.sheet_root_id and organization_id = new.organization_id) then
    raise exception 'Ficha de outra empresa' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists unit_sheet_adjustments_guard on unit_sheet_adjustments;
create trigger unit_sheet_adjustments_guard before insert or update on unit_sheet_adjustments for each row execute function unit_sheet_adjustments_guard();

-- Perfis da plataforma (a validar com a RT). PAT: Portaria Interministerial 66/2006; PNAE: Resolução
-- CD/FNDE 06/2020 — as metas do PNAE variam por etapa e período e ficam para a RT preencher na cópia.
do $$
begin
  perform set_config('rafanutri.seed', 'on', true);
  insert into diner_profiles (organization_id, code, name, segment, services, targets, reference, validated) values
    (null, 'pat-grande-refeicao', 'PAT — almoço, jantar e ceia', 'pat', '{lunch,dinner,supper}',
     '{"energy_kcal":{"min":600,"max":800},"carb_pct":{"min":55,"max":75},"protein_pct":{"target":15},"fat_pct":{"min":15,"max":30},"saturated_fat_pct":{"max":10},"fiber_g":{"min":7,"max":10},"sodium_mg":{"min":720,"max":960}}',
     'Portaria Interministerial 66/2006 (a validar)', false),
    (null, 'pat-pequena-refeicao', 'PAT — desjejum e lanche', 'pat', '{breakfast,morning_snack,afternoon_snack}',
     '{"energy_kcal":{"min":300,"max":400},"carb_pct":{"min":55,"max":75},"protein_pct":{"target":15},"fat_pct":{"min":15,"max":30},"saturated_fat_pct":{"max":10},"fiber_g":{"min":4,"max":5},"sodium_mg":{"min":360,"max":480}}',
     'Portaria Interministerial 66/2006 (a validar)', false),
    (null, 'pnae-fundamental-parcial', 'PNAE — ensino fundamental, período parcial', 'pnae', '{morning_snack,lunch,afternoon_snack}',
     '{}', 'Resolução CD/FNDE 06/2020 — preencher as metas da etapa com a RT', false),
    (null, 'pnae-infantil-integral', 'PNAE — educação infantil, período integral', 'pnae', '{breakfast,morning_snack,lunch,afternoon_snack}',
     '{}', 'Resolução CD/FNDE 06/2020 — preencher as metas da etapa com a RT', false),
    (null, 'hospital-geral', 'Hospitalar — dieta geral', 'hospital', '{breakfast,lunch,afternoon_snack,dinner,supper}',
     '{}', 'Definir com a equipe de nutrição clínica', false)
  on conflict do nothing;
  perform set_config('rafanutri.seed', 'off', true);
end $$;

do $$
declare t text;
begin
  foreach t in array array['diner_profiles', 'menu_rules', 'unit_sheet_adjustments'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0052_menu_planning') on conflict do nothing;

commit;
