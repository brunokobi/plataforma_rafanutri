-- RN-206/RN-207 — Biblioteca de receitas e receitas na área do paciente. Idempotente.
-- Regras no banco:
--   * recipes ganha descrição, tempo de preparo, dificuldade, tags e foto (directus_files). A foto é
--     enviada e servida pelos endpoints da extensão, que conferem quem pode ver;
--   * patient_recipes: receita enviada a um paciente. Só owner/nutricionista do consultório envia, só
--     para paciente ativo do consultório e só receita do próprio consultório. Um envio por receita e
--     paciente (reenviar atualiza a observação).
-- O paciente vê as receitas enviadas e as usadas no plano publicado (calculado no endpoint).

begin;

alter table recipes add column if not exists description text;
alter table recipes add column if not exists prep_minutes integer;
alter table recipes add column if not exists difficulty text;
alter table recipes add column if not exists tags jsonb not null default '[]'::jsonb;
alter table recipes add column if not exists image uuid references directus_files (id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'recipes_description_length') then
    alter table recipes add constraint recipes_description_length check (description is null or length(description) <= 600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipes_prep_minutes_range') then
    alter table recipes add constraint recipes_prep_minutes_range check (prep_minutes is null or prep_minutes between 1 and 1440);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipes_difficulty_check') then
    alter table recipes add constraint recipes_difficulty_check check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recipes_tags_check') then
    alter table recipes add constraint recipes_tags_check check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 10);
  end if;
end $$;

create index if not exists recipes_tags on recipes using gin (tags);

create table if not exists patient_recipes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  recipe_food_id  integer not null references foods (id) on delete cascade,
  note            text check (note is null or length(note) <= 500),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  constraint patient_recipes_unique unique (patient_id, recipe_food_id)
);

create index if not exists patient_recipes_org on patient_recipes (organization_id);

create or replace function patient_recipes_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.recipe_food_id <> old.recipe_food_id then
      raise exception 'O envio não muda de paciente nem de receita' using errcode = 'P0001';
    end if;
    new.date_created := old.date_created;
    new.date_updated := now();
    return new;
  end if;
  if new.user_created is null or not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
  ) then
    raise exception 'Só owner ou nutricionista do consultório envia receitas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
    raise exception 'Só pacientes ativos do consultório recebem receitas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from foods where id = new.recipe_food_id and kind = 'recipe' and organization_id = new.organization_id) then
    raise exception 'Só receitas do próprio consultório podem ser enviadas' using errcode = 'P0001';
  end if;
  new.date_created := now();
  new.date_updated := null;
  return new;
end $$;

drop trigger if exists patient_recipes_guard on patient_recipes;
create trigger patient_recipes_guard before insert or update on patient_recipes
  for each row execute function patient_recipes_guard();

insert into schema_migrations (version) values ('0019_recipe_library') on conflict do nothing;

commit;
