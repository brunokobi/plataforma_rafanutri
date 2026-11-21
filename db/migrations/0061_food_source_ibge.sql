-- Base pública do IBGE (POF 2008-2009): fonte e os nutrientes que ela traz a mais que a TACO.
-- Os alimentos entram por db/seed/ibge/import.sql (como a TACO). Idempotente.

begin;

insert into food_sources (code, name, version, citation, license_notes) values (
  'IBGE',
  'Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil (POF)',
  'POF 2008-2009 (2011), com a Tabela de Medidas Referidas',
  'INSTITUTO BRASILEIRO DE GEOGRAFIA E ESTATÍSTICA (IBGE). Pesquisa de Orçamentos Familiares 2008-2009: tabelas de composição nutricional dos alimentos consumidos no Brasil. Rio de Janeiro: IBGE, 2011. Tabela de medidas referidas para os alimentos consumidos no Brasil. Rio de Janeiro: IBGE, 2011.',
  'Dados públicos do IBGE, uso livre com citação da fonte. Valores por 100 g; "-" na fonte (não disponível) gravado como nulo. Sódio sem o sal do preparo; o sal do preparo fica em "Sódio de adição".'
)
on conflict (code) do update set
  name = excluded.name, version = excluded.version, citation = excluded.citation, license_notes = excluded.license_notes;

insert into nutrients (code, name, unit, position) values
  ('sugar_total_g',     'Açúcares totais',                 'g',   31),
  ('sugar_added_g',     'Açúcar de adição',                'g',   32),
  ('trans_fat_g',       'Gorduras trans',                  'g',   43),
  ('added_sodium_mg',   'Sódio de adição (sal do preparo)', 'mg', 75),
  ('selenium_mcg',      'Selênio',                         'mcg', 79),
  ('vitamin_b12_mcg',   'Vitamina B12',                    'mcg', 88),
  ('folate_mcg',        'Folato (DFE)',                    'mcg', 89),
  ('vitamin_d_mcg',     'Vitamina D',                      'mcg', 90),
  ('vitamin_e_mg',      'Vitamina E',                      'mg',  91)
on conflict (code) do update set name = excluded.name, unit = excluded.unit, position = excluded.position;

insert into schema_migrations (version) values ('0061_food_source_ibge') on conflict do nothing;

commit;
