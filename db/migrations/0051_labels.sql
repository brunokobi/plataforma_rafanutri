-- U7 — Rotulagem nutricional (RN-162 a RN-164). Idempotente.
--
-- Decisões:
-- - O cálculo (por 100 g/mL e por porção, %VD, arredondamentos e lupa da IN 75/2020) fica no
--   nutrition-core; o banco guarda o rótulo emitido como retrato imutável (valores, lupa, alergênicos e
--   a versão da ficha usada). Valores de referência e limites estão marcados "a validar" no código.
-- - Açúcares adicionados não vêm da TACO: informados por insumo (g por 100 g).
-- - Rótulo só de ficha aprovada; não se altera (só arquiva); emitido por owner, gestor ou RT (no endpoint).

begin;

alter table ingredients add column if not exists added_sugar_g_100g numeric(6, 2)
  check (added_sugar_g_100g is null or added_sugar_g_100g between 0 and 100);

create table if not exists nutrition_labels (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete cascade,
  sheet_id           uuid not null references tech_sheets (id) on delete cascade,
  sheet_root_id      uuid not null,
  sheet_version      integer not null,
  product_name       text not null check (char_length(btrim(product_name)) between 2 and 120),
  physical_state     text not null default 'solid' check (physical_state in ('solid', 'liquid')),
  portion_g          numeric(8, 1) not null check (portion_g > 0 and portion_g <= 5000),
  household_measure  text not null check (char_length(btrim(household_measure)) between 2 and 60),
  servings_per_pack  numeric(6, 1) check (servings_per_pack is null or servings_per_pack > 0),
  values             jsonb not null check (jsonb_typeof(values) = 'object'),
  front_warnings     text[] not null default '{}' check (front_warnings <@ '{added_sugar,saturated_fat,sodium}'),
  allergens          text[] not null default '{}',
  allergen_statement text check (allergen_statement is null or char_length(allergen_statement) <= 1000),
  layout             text not null default 'vertical' check (layout in ('vertical', 'horizontal', 'linear')),
  archived           boolean not null default false,
  created_by         uuid references directus_users (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (allergens <@ uan_allergen_codes())
);
create index if not exists nutrition_labels_sheet on nutrition_labels (organization_id, sheet_root_id, created_at desc);

create or replace function nutrition_labels_guard() returns trigger language plpgsql as $$
declare s tech_sheets;
begin
  if tg_op = 'INSERT' then
    select * into s from tech_sheets where id = new.sheet_id;
    if s.status <> 'approved' then raise exception 'Rótulo só de ficha aprovada' using errcode = 'P0001'; end if;
    new.organization_id := s.organization_id;
    new.sheet_root_id := s.root_id;
    new.sheet_version := s.version;
    new.archived := false;
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'archived' - 'created_by') = (to_jsonb(old) - 'archived' - 'created_by') and (new.archived or not old.archived) then
    return new; -- arquivar (sem desarquivar) ou FK set null
  end if;
  raise exception 'Rótulo emitido não se altera; emita outro' using errcode = 'P0001';
end $$;
drop trigger if exists nutrition_labels_guard on nutrition_labels;
create trigger nutrition_labels_guard before insert or update on nutrition_labels for each row execute function nutrition_labels_guard();

do $$
begin
  drop trigger if exists nutrition_labels_audit on nutrition_labels;
  create trigger nutrition_labels_audit after insert or update or delete on nutrition_labels for each row execute function audit_trigger();
end $$;

insert into schema_migrations (version) values ('0051_labels') on conflict do nothing;

commit;
