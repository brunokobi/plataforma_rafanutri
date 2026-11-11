-- RN-033 (início) — Medidas caseiras dos alimentos mais comuns da TACO.
-- Lista inicial com pesos de referência usuais; **revisar com a nutricionista** antes do beta.
-- Só preenche quem ainda não tem medidas (não sobrescreve ajustes feitos depois). Idempotente.

begin;

with m (source_code, measures) as (values
  ('1',   '[{"label":"colher de sopa","grams":25},{"label":"escumadeira","grams":45}]'),
  ('3',   '[{"label":"colher de sopa","grams":25},{"label":"escumadeira","grams":45}]'),
  ('7',   '[{"label":"colher de sopa","grams":15}]'),
  ('52',  '[{"label":"fatia","grams":25}]'),
  ('53',  '[{"label":"unidade","grams":50}]'),
  ('88',  '[{"label":"colher de sopa","grams":30},{"label":"unidade média","grams":150}]'),
  ('561', '[{"label":"concha média","grams":80}]'),
  ('577', '[{"label":"concha média","grams":80}]'),
  ('410', '[{"label":"filé médio","grams":100}]'),
  ('377', '[{"label":"bife médio","grams":100}]'),
  ('313', '[{"label":"filé médio","grams":120}]'),
  ('488', '[{"label":"unidade","grams":50}]'),
  ('448', '[{"label":"pote","grams":170}]'),
  ('457', '[{"label":"copo americano","grams":190}]'),
  ('461', '[{"label":"fatia média","grams":30}]'),
  ('182', '[{"label":"unidade média","grams":70}]'),
  ('222', '[{"label":"unidade média","grams":130}]'),
  ('226', '[{"label":"fatia média","grams":100}]'),
  ('239', '[{"label":"unidade","grams":12}]'),
  ('100', '[{"label":"colher de sopa","grams":15}]'),
  ('78',  '[{"label":"folha","grams":10}]'),
  ('157', '[{"label":"rodela","grams":15}]'),
  ('110', '[{"label":"colher de sopa ralada","grams":12}]'),
  ('260', '[{"label":"colher de chá","grams":4},{"label":"colher de sopa","grams":8}]'),
  ('589', '[{"label":"unidade","grams":4}]')
)
update foods f
set household_measures = m.measures::jsonb, updated_at = now()
from m, food_sources s
where s.code = 'TACO' and f.source_id = s.id and f.source_code = m.source_code
  and f.household_measures = '[]'::jsonb;

insert into schema_migrations (version) values ('0003_household_measures') on conflict do nothing;

commit;
