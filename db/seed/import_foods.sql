-- Importação genérica de base pública (OFF, USDA) a partir de CSV no formato comum dos geradores:
-- source_code, name, food_group, household_measures (JSON), e as 38 colunas de nutrientes em ordem fixa (vazio = não informado).
-- Só grava os valores informados (ausente = não analisado, como nulo). Idempotente: atualiza o que já existe.
-- Uso: psql -v ON_ERROR_STOP=1 -v source=OFF -v csv=/caminho/off-brasil.csv -f import_foods.sql

begin;

create temp table food_staging (
  source_code text, name text, food_group text, household_measures text,
  energy_kcal text, energy_kj text, protein_g text, carbohydrate_g text, lipid_g text, saturated_fat_g text, monounsaturated_fat_g text,
  polyunsaturated_fat_g text, trans_fat_g text, cholesterol_mg text, fiber_g text, sugar_total_g text, sugar_added_g text, moisture_pct text, ash_g text,
  calcium_mg text, magnesium_mg text, manganese_mg text, phosphorus_mg text, iron_mg text, sodium_mg text, added_sodium_mg text, potassium_mg text,
  copper_mg text, zinc_mg text, selenium_mcg text, retinol_mcg text, vitamin_a_re_mcg text, vitamin_a_rae_mcg text, thiamin_mg text, riboflavin_mg text,
  pyridoxine_mg text, niacin_mg text, vitamin_b12_mcg text, folate_mcg text, vitamin_d_mcg text, vitamin_e_mg text, vitamin_c_mg text
) on commit drop;

\set copy_cmd '\\copy food_staging from ' :'csv' ' with (format csv, header true, encoding ''UTF8'')'
:copy_cmd

create temp table import_source on commit drop as select id from food_sources where code = :'source';
do $$ begin
  if (select count(*) from import_source) <> 1 then raise exception 'Fonte desconhecida (rode a migração 0064 antes)'; end if;
end $$;

insert into foods (source_id, source_code, name, food_group, household_measures, updated_at)
select s.id, t.source_code, left(t.name, 160), t.food_group, coalesce(nullif(t.household_measures, ''), '[]')::jsonb, now()
from food_staging t cross join import_source s
on conflict (source_id, source_code) do update set
  name = excluded.name, food_group = excluded.food_group, household_measures = excluded.household_measures, updated_at = now();

insert into food_nutrients (food_id, nutrient_id, amount_per_100g, is_trace)
select f.id, n.id, v.value::numeric, false
from food_staging t
join foods f on f.source_code = t.source_code and f.source_id = (select id from import_source)
cross join lateral jsonb_each_text(to_jsonb(t) - 'source_code' - 'name' - 'food_group' - 'household_measures') as v(key, value)
join nutrients n on n.code = v.key
where coalesce(v.value, '') <> ''
on conflict (food_id, nutrient_id) do update set amount_per_100g = excluded.amount_per_100g, is_trace = false;

do $$
declare staged int; loaded int; no_kcal int;
begin
  select count(*) into staged from food_staging;
  select count(*) into loaded from foods where source_id = (select id from import_source);
  select count(*) into no_kcal from foods f where f.source_id = (select id from import_source)
    and not exists (select 1 from food_nutrients fn join nutrients n on n.id = fn.nutrient_id where fn.food_id = f.id and n.code = 'energy_kcal');
  if loaded < staged then raise exception 'Importação incompleta: % de % alimentos', loaded, staged; end if;
  raise notice 'Importados: % alimentos (% sem energia)', loaded, no_kcal;
end $$;

commit;
