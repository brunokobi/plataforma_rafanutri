-- Testes da migração 0033 (base do módulo UAN). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0033_uan_units.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; ub uuid; uc uuid; ok boolean;
begin
  insert into directus_users (id, email) values (owner, 'uan-owner@example.com'), (cook, 'uan-cook@example.com'), (other, 'uan-other@example.com');
  o1 := create_organization(owner, 'Cozinha Industrial A', 'company', null, '1', 'CRN-1');
  o2 := create_organization(other, 'Outra Empresa', 'company', null, '1', 'CRN-2');
  assert o1.modules = '{clinical}', 'padrão: só o clínico';
  assert not org_has_module(o1.id, 'uan'), 'sem UAN';

  -- módulo desabilitado: não cria unidade
  ok := false; begin insert into production_units (organization_id, name) values (o1.id, 'Unidade X');
  exception when check_violation then ok := true; end; assert ok, 'sem módulo não cria unidade';

  ok := false; begin update organizations set modules = '{clinical,rh}' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'módulo desconhecido';
  ok := false; begin update organizations set modules = '{}' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'ao menos um módulo';

  update organizations set modules = '{clinical,uan}' where id = o1.id;
  assert org_has_module(o1.id, 'uan'), 'UAN habilitado';

  -- sem contrato: 1 unidade ativa
  insert into production_units (organization_id, name, kind) values (o1.id, 'Unidade A', 'industrial') returning id into ua;
  ok := false; begin insert into production_units (organization_id, name) values (o1.id, 'Unidade B');
  exception when check_violation then ok := true; end; assert ok, 'sem contrato: só 1 ativa';
  insert into production_units (organization_id, name, active) values (o1.id, 'Unidade B', false) returning id into ub;

  -- contrato de 2 unidades: ativa a segunda, não a terceira
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  assert uan_unit_limit(o1.id) = 2, 'limite do contrato';
  update production_units set active = true where id = ub;
  ok := false; begin insert into production_units (organization_id, name) values (o1.id, 'Unidade C');
  exception when check_violation then ok := true; end; assert ok, 'contrato de 2: não ativa a terceira';
  insert into production_units (organization_id, name, active) values (o1.id, 'Unidade C', false) returning id into uc;
  ok := false; begin update production_units set active = true where id = uc;
  exception when check_violation then ok := true; end; assert ok, 'reativar também respeita o limite';

  -- contrato vencido não conta
  update organization_contracts set starts_at = current_date - 60, ends_at = current_date - 1 where organization_id = o1.id;
  assert uan_unit_limit(o1.id) = 1, 'contrato vencido volta a 1';
  delete from organization_contracts where organization_id = o1.id;

  -- validações de campos
  ok := false; begin update production_units set cnpj = '12.345.678/0001-90' where id = ua;
  exception when check_violation then ok := true; end; assert ok, 'CNPJ só dígitos';
  ok := false; begin update production_units set geo_lat = -20.3 where id = ua;
  exception when check_violation then ok := true; end; assert ok, 'lat sem lng';
  update production_units set cnpj = '12345678000190', geo_lat = -20.3155, geo_lng = -40.3128, state = 'ES' where id = ua;
  ok := false; begin update production_units set organization_id = o2.id where id = ua;
  exception when check_violation then ok := true; end; assert ok, 'não muda de organização';

  -- papéis por unidade: o cozinheiro de A não tem papel em B; o owner tem tudo; um RT por unidade
  insert into unit_members (unit_id, user_id, role) values (ua, cook, 'cook');
  assert has_unit_role(ua, cook), 'cozinheiro em A';
  assert has_unit_role(ua, cook, '{cook}'), 'papel cook em A';
  assert not has_unit_role(ua, cook, '{technical_lead,manager}'), 'cozinheiro não é RT';
  assert not has_unit_role(ub, cook), 'cozinheiro não vê B';
  assert has_unit_role(ub, owner, '{technical_lead}'), 'owner tem todos os papéis';
  assert not has_unit_role(ua, other), 'outra empresa não vê A';
  assert not exists (select 1 from organization_members where user_id = cook), 'equipe UAN fora de organization_members';
  insert into unit_members (unit_id, user_id, role) values (ua, owner, 'technical_lead');
  ok := false; begin insert into unit_members (unit_id, user_id, role) values (ua, cook, 'technical_lead');
  exception when unique_violation then ok := true; end; assert ok, 'um RT por unidade';

  -- auditoria
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'production_units' and entity_id = ua::text and action = 'insert'), 'criação auditada';

  -- apagar a organização leva unidades, equipe e contratos
  delete from organizations where id = o1.id;
  assert not exists (select 1 from production_units where organization_id = o1.id), 'unidades em cascata';
  assert not exists (select 1 from unit_members where unit_id = ua), 'equipe em cascata';
end $$;

rollback;
