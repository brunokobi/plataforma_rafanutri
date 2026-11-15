-- Testes da migração 0036 (equipamentos e temperaturas). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0036_temperatures.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; ub uuid; fridge uuid; freezer uuid; hot uuid; r1 uuid; r2 uuid; ok boolean; nc non_conformities;
begin
  insert into directus_users (id, email) values (owner, 'temp-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Temperaturas', 'company', null, '1', 'CRN-6');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade B') returning id into ub;

  -- limites padrão por tipo
  insert into equipment (unit_id, name, kind) values (ua, 'Geladeira 1', 'refrigerator') returning id into fridge;
  insert into equipment (unit_id, name, kind) values (ua, 'Freezer', 'freezer') returning id into freezer;
  insert into equipment (unit_id, name, kind) values (ua, 'Pass-through quente', 'hot_holding') returning id into hot;
  assert (select (min_temp, max_temp) from equipment where id = fridge) = (null::numeric, 5::numeric), 'geladeira até 5';
  assert (select max_temp from equipment where id = freezer) = -18, 'freezer até -18';
  assert (select (min_temp, max_temp) from equipment where id = hot) = (60::numeric, null::numeric), 'quente a partir de 60';
  assert (select organization_id from equipment where id = fridge) = o1.id, 'organização da unidade';
  ok := false; begin insert into equipment (unit_id, name, kind) values (ua, 'Sem limite', 'other');
  exception when check_violation then ok := true; end; assert ok, 'outro tipo exige limite';
  ok := false; begin update equipment set unit_id = ub where id = fridge;
  exception when raise_exception then ok := true; end; assert ok, 'não muda de unidade';

  -- leitura dentro do limite
  insert into temperature_readings (unit_id, equipment_id, value, client_id, recorded_by) values (ub, fridge, 4, gen_random_uuid(), owner) returning id into r1;
  assert (select (unit_id, out_of_range, max_temp) from temperature_readings where id = r1) = (ua, false, 5::numeric), 'unidade do equipamento, dentro';

  -- fora do limite exige ação corretiva
  ok := false; begin insert into temperature_readings (unit_id, equipment_id, value, client_id) values (ua, fridge, 7, gen_random_uuid());
  exception when raise_exception then ok := sqlerrm like '%ação corretiva%'; end; assert ok, 'ação corretiva obrigatória';
  insert into temperature_readings (unit_id, equipment_id, value, corrective_action, client_id, recorded_by)
    values (ua, fridge, 7, 'Porta fechada; nova leitura em 30 min', gen_random_uuid(), owner) returning id into r1;
  assert (select out_of_range from temperature_readings where id = r1), 'fora do limite';
  assert not exists (select 1 from non_conformities where equipment_id = fridge), 'uma leitura fora não abre NC';

  -- segunda seguida fora: abre NC alta (72 h); terceira não duplica
  insert into temperature_readings (unit_id, equipment_id, value, corrective_action, client_id, recorded_by)
    values (ua, fridge, 8.5, 'Chamado técnico aberto; alimentos transferidos', gen_random_uuid(), owner) returning id into r2;
  select * into nc from non_conformities where equipment_id = fridge;
  assert nc.id is not null and nc.severity = 'high' and nc.source = 'temperature' and nc.status = 'open', 'NC aberta';
  assert nc.due_at between now() + interval '71 hours' and now() + interval '73 hours', 'prazo 72 h';
  assert nc.description like '%7.0 °C e 8.5 °C%', nc.description;
  assert (select non_conformity_id from temperature_readings where id = r2) = nc.id, 'leitura ligada à NC';
  insert into temperature_readings (unit_id, equipment_id, value, corrective_action, client_id) values (ua, fridge, 9, 'Aguardando técnico', gen_random_uuid());
  assert (select count(*) from non_conformities where equipment_id = fridge) = 1, 'não duplica com NC aberta';

  -- leitura imutável
  ok := false; begin update temperature_readings set value = 3 where id = r1;
  exception when raise_exception then ok := true; end; assert ok, 'não altera';
  ok := false; begin delete from temperature_readings where id = r1;
  exception when raise_exception then ok := true; end; assert ok, 'não apaga';

  -- mudar o limite não muda o histórico
  update equipment set max_temp = 8 where id = fridge;
  assert (select max_temp from temperature_readings where id = r1) = 5, 'limite copiado';

  -- alimento: cocção ≥ 70, distribuição fria ≤ 5
  insert into temperature_readings (unit_id, food_stage, food_name, value, client_id) values (ua, 'cooking', 'Frango assado', 78, gen_random_uuid()) returning id into r1;
  assert (select (out_of_range, min_temp) from temperature_readings where id = r1) = (false, 70::numeric), 'cocção ok';
  ok := false; begin insert into temperature_readings (unit_id, food_stage, food_name, value, client_id) values (ua, 'holding_cold', 'Salada', 9, gen_random_uuid());
  exception when raise_exception then ok := true; end; assert ok, 'salada a 9 °C exige ação';
  ok := false; begin insert into temperature_readings (unit_id, food_stage, value, client_id) values (ua, 'cooking', 80, gen_random_uuid());
  exception when check_violation then ok := true; end; assert ok, 'alimento exige nome';

  -- idempotência
  ok := false; begin
    insert into temperature_readings (unit_id, equipment_id, value, client_id) values (ua, freezer, -20, '11111111-1111-1111-1111-111111111111');
    insert into temperature_readings (unit_id, equipment_id, value, client_id) values (ua, freezer, -20, '11111111-1111-1111-1111-111111111111');
  exception when unique_violation then ok := true; end; assert ok, 'client_id único';

  -- equipamento inativo e unidade inativa não registram
  update equipment set active = false where id = hot;
  ok := false; begin insert into temperature_readings (unit_id, equipment_id, value, client_id) values (ua, hot, 65, gen_random_uuid());
  exception when raise_exception then ok := true; end; assert ok, 'equipamento inativo';
  update production_units set active = false where id = ub;
  ok := false; begin insert into temperature_readings (unit_id, food_stage, food_name, value, client_id) values (ub, 'cooking', 'Arroz', 90, gen_random_uuid());
  exception when raise_exception then ok := true; end; assert ok, 'unidade inativa';

  -- auditoria e cascata
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'temperature_readings' and action = 'insert'), 'leitura auditada';
  delete from organizations where id = o1.id;
  assert not exists (select 1 from temperature_readings where organization_id = o1.id), 'leituras em cascata';
  assert not exists (select 1 from equipment where organization_id = o1.id), 'equipamentos em cascata';
end $$;

rollback;
