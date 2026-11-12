-- RN-035 — Modelos de plano alimentar. Idempotente.
-- Um modelo guarda o conteúdo de um plano (refeições, metas, orientações) sem paciente, para
-- aplicar a outros pacientes (com ou sem escala de calorias, feita no app).
-- Regras no banco (ADR 0008, regra 3):
--   * organization_id nulo = biblioteca da plataforma (métodos de prescrição, a validar com a
--     nutricionista); consultórios não alteram esses;
--   * modelo do consultório: autor owner/nutricionista; não muda de consultório;
--   * até 10 tags curtas.

begin;

create table if not exists meal_plan_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 2 and 120),
  description     text check (description is null or length(description) <= 500),
  tags            text[] not null default '{}' check (cardinality(tags) <= 10),
  mode            text not null default 'quantitative' check (mode in ('quantitative', 'qualitative')),
  targets         jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  meals           jsonb not null default '[]'::jsonb check (jsonb_typeof(meals) = 'array'),
  guidelines      text check (guidelines is null or length(guidelines) <= 4000),
  energy_kcal     numeric(7, 1) check (energy_kcal is null or energy_kcal between 0 and 20000),
  source_plan_id  uuid references meal_plans (id) on delete set null,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create index if not exists meal_plan_templates_org on meal_plan_templates (organization_id);

create or replace function meal_plan_templates_guard() returns trigger language plpgsql as $$
declare t text;
begin
  -- tags: aparadas, sem vazias nem repetidas, até 30 caracteres cada
  new.tags := coalesce((select array_agg(distinct x order by x) from unnest(new.tags) as u(raw), lateral (select lower(trim(raw)) as x) s where x <> ''), '{}');
  foreach t in array new.tags loop
    if length(t) > 30 then raise exception 'Etiqueta muito longa: %', t using errcode = 'P0001'; end if;
  end loop;
  if tg_op = 'INSERT' then
    if new.organization_id is not null and new.user_created is not null and not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos de plano' using errcode = 'P0001';
    end if;
    if new.source_plan_id is not null and not exists (
      select 1 from meal_plans where id = new.source_plan_id and organization_id = new.organization_id
    ) then
      raise exception 'O plano de origem não é deste consultório' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception 'O modelo não pode mudar de consultório' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  return new;
end $$;

drop trigger if exists meal_plan_templates_guard on meal_plan_templates;
create trigger meal_plan_templates_guard before insert or update on meal_plan_templates
  for each row execute function meal_plan_templates_guard();

insert into schema_migrations (version) values ('0009_meal_plan_templates') on conflict do nothing;

commit;
