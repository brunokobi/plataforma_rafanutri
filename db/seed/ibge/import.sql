-- Importação da base do IBGE (POF 2008-2009) gerada por build_pof_csv.py. Requer a migração 0061.
-- Idempotente: atualiza o que já existe, sem duplicar.
-- Uso: psql -v ON_ERROR_STOP=1 -v csv=/caminho/pof-2008-2009.csv -f import.sql
-- Células: número | vazio (não disponível -> null). Medidas caseiras em JSON na coluna household_measures.

begin;

create temp table pof_staging (
  source_code text, name text, food_group text, household_measures text,
  energy_kcal text, protein_g text, lipid_g text, carbohydrate_g text, fiber_g text, calcium_mg text, magnesium_mg text,
  manganese_mg text, phosphorus_mg text, iron_mg text, sodium_mg text, added_sodium_mg text, potassium_mg text, copper_mg text,
  zinc_mg text, selenium_mcg text, retinol_mcg text, vitamin_a_rae_mcg text, thiamin_mg text, riboflavin_mg text, niacin_mg text,
  pyridoxine_mg text, vitamin_b12_mcg text, folate_mcg text, vitamin_d_mcg text, vitamin_e_mg text, vitamin_c_mg text,
  cholesterol_mg text, saturated_fat_g text, monounsaturated_fat_g text, polyunsaturated_fat_g text, trans_fat_g text,
  sugar_total_g text, sugar_added_g text, energy_kj text
) on commit drop;

\set copy_cmd '\\copy pof_staging from ' :'csv' ' with (format csv, header true, encoding ''UTF8'')'
:copy_cmd

insert into foods (source_id, source_code, name, food_group, household_measures, updated_at)
select s.id, t.source_code, t.name, t.food_group, t.household_measures::jsonb, now()
from pof_staging t
cross join (select id from food_sources where code = 'IBGE') s
on conflict (source_id, source_code) do update set
  name = excluded.name, food_group = excluded.food_group, household_measures = excluded.household_measures, updated_at = now();

insert into food_nutrients (food_id, nutrient_id, amount_per_100g, is_trace)
select f.id, n.id, nullif(v.value, '')::numeric, false
from pof_staging t
join foods f on f.source_code = t.source_code and f.source_id = (select id from food_sources where code = 'IBGE')
cross join lateral jsonb_each_text(to_jsonb(t) - 'source_code' - 'name' - 'food_group' - 'household_measures') as v(key, value)
join nutrients n on n.code = v.key
on conflict (food_id, nutrient_id) do update set amount_per_100g = excluded.amount_per_100g, is_trace = false;

-- Conferência: todo alimento da planilha entrou, com os 35 nutrientes, e as calorias estão preenchidas.
do $$
declare staged int; foods_count int; values_count int; no_kcal int;
begin
  select count(*) into staged from pof_staging;
  select count(*) into foods_count from foods f join food_sources s on s.id = f.source_id where s.code = 'IBGE';
  select count(*) into values_count from food_nutrients fn join foods f on f.id = fn.food_id
    join food_sources s on s.id = f.source_id where s.code = 'IBGE';
  select count(*) into no_kcal from pof_staging where coalesce(energy_kcal, '') = '';
  if foods_count < staged or values_count < staged * 35 then
    raise exception 'IBGE incompleto: % alimentos e % valores (esperado % e %)', foods_count, values_count, staged, staged * 35;
  end if;
  raise notice 'IBGE ok: % alimentos, % valores, % sem calorias', foods_count, values_count, no_kcal;
end $$;

commit;
