-- RN-035 — Etiquetas dos modelos de plano em jsonb (o Directus não grava text[]: envia o array
-- como texto JSON e o Postgres recusa com "malformed array literal"). Idempotente.
-- Mesmas regras de antes: até 10 etiquetas, aparadas, minúsculas, sem vazias nem repetidas, até 30 caracteres.

begin;

do $$ begin
  if (select data_type from information_schema.columns where table_name = 'meal_plan_templates' and column_name = 'tags') = 'ARRAY' then
    alter table meal_plan_templates drop constraint if exists meal_plan_templates_tags_check;
    alter table meal_plan_templates alter column tags drop default;
    alter table meal_plan_templates alter column tags type jsonb using to_jsonb(tags);
    alter table meal_plan_templates alter column tags set default '[]'::jsonb;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meal_plan_templates_tags_array') then
    alter table meal_plan_templates add constraint meal_plan_templates_tags_array
      check (jsonb_typeof(tags) = 'array' and jsonb_array_length(tags) <= 10);
  end if;
end $$;

create or replace function meal_plan_templates_guard() returns trigger language plpgsql as $$
declare t text;
begin
  if new.tags is null or jsonb_typeof(new.tags) <> 'array' then
    raise exception 'Etiquetas devem ser uma lista' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(new.tags) e where jsonb_typeof(e) <> 'string') then
    raise exception 'Etiquetas devem ser textos' using errcode = 'P0001';
  end if;
  new.tags := coalesce(
    (select jsonb_agg(x order by x) from (select distinct lower(trim(v)) as x from jsonb_array_elements_text(new.tags) as v) s where x <> ''),
    '[]'::jsonb);
  for t in select jsonb_array_elements_text(new.tags) loop
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

insert into schema_migrations (version) values ('0010_meal_plan_templates_tags_jsonb') on conflict do nothing;

commit;
