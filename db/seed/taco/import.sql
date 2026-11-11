-- RN-011 — Importação da TACO 4ª edição. Idempotente: atualiza o que já existe, sem duplicar.
-- Uso: psql -v ON_ERROR_STOP=1 -v csv=/caminho/taco-4ed.csv -f import.sql
-- Células do CSV: número | "Tr" (traço -> 0 com is_trace) | vazio (não analisado -> null).

begin;

insert into food_sources (code, name, version, citation, license_notes) values (
  'TACO',
  'Tabela Brasileira de Composição de Alimentos',
  '4ª edição revisada e ampliada (2011)',
  'NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA). Tabela Brasileira de Composição de Alimentos – TACO. 4. ed. rev. e ampl. Campinas: NEPA/UNICAMP, 2011. 161 p.',
  'Reprodução permitida desde que citada a fonte (NEPA/UNICAMP). Valores por 100 g de parte comestível.'
)
on conflict (code) do update set
  name = excluded.name, version = excluded.version,
  citation = excluded.citation, license_notes = excluded.license_notes;

create temp table taco_staging (
  taco_code text, name text, food_group text,
  moisture_pct text, energy_kcal text, energy_kj text, protein_g text, lipid_g text,
  cholesterol_mg text, carbohydrate_g text, fiber_g text, ash_g text, calcium_mg text,
  magnesium_mg text, manganese_mg text, phosphorus_mg text, iron_mg text, sodium_mg text,
  potassium_mg text, copper_mg text, zinc_mg text, retinol_mcg text, vitamin_a_re_mcg text,
  vitamin_a_rae_mcg text, thiamin_mg text, riboflavin_mg text, pyridoxine_mg text,
  niacin_mg text, vitamin_c_mg text, saturated_fat_g text, monounsaturated_fat_g text,
  polyunsaturated_fat_g text
) on commit drop;

-- \copy não interpola variáveis: monta o comando numa variável e executa.
\set copy_cmd '\\copy taco_staging from ' :'csv' ' with (format csv, header true, encoding ''UTF8'')'
:copy_cmd

insert into foods (source_id, source_code, name, food_group, updated_at)
select s.id, t.taco_code, t.name, t.food_group, now()
from taco_staging t
cross join (select id from food_sources where code = 'TACO') s
on conflict (source_id, source_code) do update set
  name = excluded.name, food_group = excluded.food_group, updated_at = now();

insert into food_nutrients (food_id, nutrient_id, amount_per_100g, is_trace)
select f.id, n.id,
       case when v.value = 'Tr' then 0
            when coalesce(v.value, '') = '' then null
            else v.value::numeric end,
       coalesce(v.value = 'Tr', false)
from taco_staging t
join foods f on f.source_code = t.taco_code
            and f.source_id = (select id from food_sources where code = 'TACO')
cross join lateral jsonb_each_text(to_jsonb(t) - 'taco_code' - 'name' - 'food_group') as v(key, value)
join nutrients n on n.code = v.key
on conflict (food_id, nutrient_id) do update set
  amount_per_100g = excluded.amount_per_100g, is_trace = excluded.is_trace;

-- Conferência: a TACO 4ª edição tem 597 alimentos e 29 nutrientes por alimento aqui.
do $$
declare foods_count int; values_count int;
begin
  select count(*) into foods_count from foods f join food_sources s on s.id = f.source_id where s.code = 'TACO';
  select count(*) into values_count from food_nutrients fn join foods f on f.id = fn.food_id
    join food_sources s on s.id = f.source_id where s.code = 'TACO';
  if foods_count <> 597 or values_count <> 597 * 29 then
    raise exception 'TACO incompleta: % alimentos e % valores (esperado 597 e %)', foods_count, values_count, 597 * 29;
  end if;
  raise notice 'TACO ok: % alimentos, % valores', foods_count, values_count;
end $$;

commit;
