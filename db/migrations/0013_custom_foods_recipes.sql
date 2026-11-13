-- RN-041 e RN-042 — Alimentos próprios e preparações do consultório. Idempotente.
-- Ficam na própria tabela `foods` (organization_id preenchido, fonte CUSTOM), então aparecem na busca
-- do editor e nos planos junto com a TACO, e a permissão de leitura já existente isola por consultório.
-- A gravação é feita pelo endpoint /rafanutri/foods e /rafanutri/recipes da extensão (transação:
-- alimento + nutrientes, ou preparação + ingredientes + composição calculada).
-- Regras no banco:
--   * alimento de consultório é sempre da fonte CUSTOM e tem autor (owner/nutricionista);
--   * base pública (organization_id nulo) só por seed/importador, nunca por usuário;
--   * "apagar" = arquivar (some da busca, planos antigos continuam mostrando o alimento).

begin;

insert into food_sources (code, name, version, citation, license_notes)
values ('CUSTOM', 'Alimentos e preparações do consultório', null, null, 'Cadastrados pelo próprio consultório; composição informada pelo profissional.')
on conflict (code) do nothing;

alter table foods add column if not exists kind text not null default 'food';
alter table foods add column if not exists archived boolean not null default false;
alter table foods add column if not exists user_created uuid references directus_users (id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'foods_kind_check') then
    alter table foods add constraint foods_kind_check check (kind in ('food', 'recipe'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foods_name_length') then
    alter table foods add constraint foods_name_length check (length(trim(name)) between 2 and 160);
  end if;
end $$;

create index if not exists foods_org_active on foods (organization_id) where not archived;

create or replace function foods_guard() returns trigger language plpgsql as $$
begin
  if new.organization_id is null then
    if tg_op = 'INSERT' and new.user_created is not null then
      raise exception 'A base pública de alimentos só é alterada pela equipe da Rafanutri' using errcode = 'P0001';
    end if;
    if new.kind <> 'food' then
      raise exception 'Preparação precisa pertencer a um consultório' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.source_id is distinct from (select id from food_sources where code = 'CUSTOM') then
    raise exception 'Alimento de consultório deve ser da fonte CUSTOM' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cadastra alimentos' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id or new.kind <> old.kind then
      raise exception 'O alimento não pode mudar de consultório nem de tipo' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists foods_guard on foods;
create trigger foods_guard before insert or update on foods
  for each row execute function foods_guard();

-- Preparação: ingredientes (ids de foods e gramas), rendimento e modo de preparo.
-- A composição por 100 g fica em food_nutrients, como qualquer alimento, calculada no endpoint.
create table if not exists recipes (
  food_id      integer primary key references foods (id) on delete cascade,
  yield_g      numeric(9, 1) not null check (yield_g > 0 and yield_g <= 100000),
  servings     numeric(6, 1) check (servings is null or (servings > 0 and servings <= 1000)),
  instructions text check (instructions is null or length(instructions) <= 4000),
  items        jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 60),
  date_updated timestamptz not null default now()
);

create or replace function recipes_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from foods where id = new.food_id and kind = 'recipe' and organization_id is not null) then
    raise exception 'A preparação precisa apontar para um alimento do tipo preparação' using errcode = 'P0001';
  end if;
  -- ingredientes: base pública ou do mesmo consultório, nunca a própria preparação
  if exists (
    select 1 from jsonb_array_elements(new.items) i
    left join foods f on f.id = (i ->> 'foodId')::integer
    where f.id is null or f.id = new.food_id
       or (f.organization_id is not null and f.organization_id <> (select organization_id from foods where id = new.food_id))
       or coalesce((i ->> 'quantityG')::numeric, 0) <= 0
  ) then
    raise exception 'Ingrediente inválido: use alimentos da base pública ou do próprio consultório, com quantidade' using errcode = 'P0001';
  end if;
  new.date_updated := now();
  return new;
end $$;

drop trigger if exists recipes_guard on recipes;
create trigger recipes_guard before insert or update on recipes
  for each row execute function recipes_guard();

insert into schema_migrations (version) values ('0013_custom_foods_recipes') on conflict do nothing;

commit;
