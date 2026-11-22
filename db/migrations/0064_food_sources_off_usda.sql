-- Fontes públicas a mais: Open Food Facts (rótulos de produtos vendidos no Brasil) e USDA FoodData Central
-- (SR Legacy, nomes traduzidos). Os alimentos entram por db/seed/import_foods.sql. Idempotente.

begin;

insert into food_sources (code, name, version, citation, license_notes) values
(
  'OFF',
  'Open Food Facts — produtos vendidos no Brasil',
  'Extração de 21/11/2026',
  'Open Food Facts. Base colaborativa de produtos alimentícios. Disponível em: https://world.openfoodfacts.org. Acesso em: 21 nov. 2026.',
  'Open Database License (ODbL) 1.0; conteúdo sob Database Contents License. Citar "Open Food Facts"; a base derivada (db/seed/off/off-brasil.csv) fica aberta sob ODbL. Valores do rótulo por 100 g (bebidas: por 100 ml).'
),
(
  'USDA',
  'USDA FoodData Central — SR Legacy (nomes traduzidos)',
  'SR Legacy, abril de 2018',
  'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: SR Legacy, 2018. Disponível em: https://fdc.nal.usda.gov.',
  'Domínio público (CC0 1.0); o USDA pede citar o FoodData Central. Nomes traduzidos para o português por IA e revisáveis; composição original do USDA por 100 g.'
)
on conflict (code) do update set name = excluded.name, version = excluded.version, citation = excluded.citation, license_notes = excluded.license_notes;

insert into schema_migrations (version) values ('0064_food_sources_off_usda') on conflict do nothing;

commit;
