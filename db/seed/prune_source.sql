-- Remove de uma base pública (OFF, USDA) os alimentos que saíram do CSV mais recente (ex.: reprovados nos filtros de qualidade),
-- só quando nada aponta para eles: planos, modelos e preparações (ids no jsonb) e insumos da UAN. Os que estão em uso ficam.
-- Uso (depois do import_foods.sql): psql -v ON_ERROR_STOP=1 -v source=OFF -v csv=/caminho/off-brasil.csv -f prune_source.sql

begin;

create temp table keep_codes (source_code text) on commit drop;
create temp table prune_staging (line text) on commit drop;
\set copy_cmd '\\copy prune_staging from ' :'csv' ' with (format text)'
:copy_cmd
-- só a primeira coluna (source_code), sem o cabeçalho; os códigos são numéricos, sem aspas nem vírgulas
insert into keep_codes select split_part(line, ',', 1) from prune_staging offset 1;

create temp table used_ids on commit drop as
select (i ->> 'foodId')::text as id from meal_plans, jsonb_array_elements(meals) m, jsonb_array_elements(m -> 'items') i
union select (s ->> 'foodId') from meal_plans, jsonb_array_elements(meals) m, jsonb_array_elements(m -> 'items') i, jsonb_array_elements(coalesce(i -> 'subs', '[]')) s
union select (i ->> 'foodId') from meal_plan_templates, jsonb_array_elements(meals) m, jsonb_array_elements(m -> 'items') i
union select (s ->> 'foodId') from meal_plan_templates, jsonb_array_elements(meals) m, jsonb_array_elements(m -> 'items') i, jsonb_array_elements(coalesce(i -> 'subs', '[]')) s
union select coalesce(i ->> 'foodId', i ->> 'food_id') from recipes, jsonb_array_elements(items) i;

with gone as (
  delete from foods f
  where f.source_id = (select id from food_sources where code = :'source') and f.organization_id is null
    and f.source_code not in (select source_code from keep_codes)
    and f.id::text not in (select id from used_ids where id is not null)
    and not exists (select 1 from ingredients g where g.food_id = f.id)
  returning 1
)
select count(*) as removidos from gone;

commit;
