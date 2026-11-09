-- RN-010: base de alimentos (TACO, TBCA e alimentos próprios da organização).

create table food_sources (
  id            uuid primary key default gen_random_uuid(),
  code          varchar(16) not null unique,
  name          varchar(120) not null,
  version       varchar(40),
  license_notes text,
  citation      text
);

create table nutrients (
  id            smallint primary key,
  code          varchar(40) not null unique,
  name_pt       varchar(80) not null,
  unit          varchar(8) not null,
  display_order smallint not null
);

insert into nutrients (id, code, name_pt, unit, display_order) values
  (1,  'energy_kcal',       'Energia',                   'kcal', 1),
  (2,  'protein_g',         'Proteína',                  'g',    2),
  (3,  'carbohydrate_g',    'Carboidrato',               'g',    3),
  (4,  'lipid_g',           'Lipídios',                  'g',    4),
  (5,  'fiber_g',           'Fibra alimentar',           'g',    5),
  (6,  'cholesterol_mg',    'Colesterol',                'mg',   6),
  (7,  'saturated_g',       'Gorduras saturadas',        'g',    7),
  (8,  'monounsaturated_g', 'Gorduras monoinsaturadas',  'g',    8),
  (9,  'polyunsaturated_g', 'Gorduras poli-insaturadas', 'g',    9),
  (10, 'calcium_mg',        'Cálcio',                    'mg',  10),
  (11, 'magnesium_mg',      'Magnésio',                  'mg',  11),
  (12, 'iron_mg',           'Ferro',                     'mg',  12),
  (13, 'sodium_mg',         'Sódio',                     'mg',  13),
  (14, 'potassium_mg',      'Potássio',                  'mg',  14),
  (15, 'zinc_mg',           'Zinco',                     'mg',  15),
  (16, 'vitamin_c_mg',      'Vitamina C',                'mg',  16),
  (17, 'vitamin_a_rae_mcg', 'Vitamina A (RAE)',          'mcg', 17),
  (18, 'vitamin_b12_mcg',   'Vitamina B12',              'mcg', 18),
  (19, 'vitamin_d_mcg',     'Vitamina D',                'mcg', 19),
  (20, 'sugars_g',          'Açúcares',                  'g',   20);

create table foods (
  id                 uuid primary key default gen_random_uuid(),
  source_id          uuid not null references food_sources(id),
  organization_id    uuid references organizations(id) on delete cascade,
  source_code        varchar(40),
  name               varchar(200) not null check (char_length(name) >= 2),
  food_group         varchar(80),
  household_measures jsonb not null default '[]',
  search_text        text generated always as (unaccent_immutable(lower(name))) stored,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (source_id, source_code)
);
create index foods_search_trgm_idx on foods using gin (search_text gin_trgm_ops);
create index foods_org_idx on foods (organization_id);

create table food_nutrients (
  id              uuid primary key default gen_random_uuid(),
  food_id         uuid not null references foods(id) on delete cascade,
  nutrient_id     smallint not null references nutrients(id),
  amount_per_100g numeric(12,4),
  is_trace        boolean not null default false,
  unique (food_id, nutrient_id)
);

/** Busca sem acento e por semelhança; prioriza alimentos da organização e depois a TACO. */
create or replace function search_foods(p_query text, p_org uuid default null, p_limit int default 20)
returns table (id uuid, name varchar, food_group varchar, source_code varchar, organization_id uuid, energy_kcal numeric, rank real)
language sql stable as $$
  with q as (select unaccent_immutable(lower(trim(p_query))) as t)
  select f.id, f.name, f.food_group, s.code, f.organization_id,
         (select fn.amount_per_100g from food_nutrients fn where fn.food_id = f.id and fn.nutrient_id = 1),
         (case when f.search_text like q.t || '%' then 1.0 else 0 end
          + similarity(f.search_text, q.t)
          + case when f.organization_id is not null then 0.3 when s.code = 'TACO' then 0.1 else 0 end)::real
  from foods f
  join food_sources s on s.id = f.source_id
  cross join q
  where f.is_active
    and (f.organization_id is null or f.organization_id = p_org)
    and (f.search_text like '%' || q.t || '%' or f.search_text % q.t)
  order by 7 desc, f.name
  limit least(greatest(p_limit, 1), 50);
$$;
