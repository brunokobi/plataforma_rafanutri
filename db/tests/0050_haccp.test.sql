-- Testes da migração 0050 (APPCC). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  rt uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; ub uuid; sheet uuid; plan uuid; v2 uuid; st_cook uuid; st_recv uuid; hz uuid; n integer; ok boolean; p haccp_plans; fridge_b uuid;
begin
  insert into directus_users (id, email) values (owner, 'hc-owner@example.com'), (rt, 'hc-rt@example.com'), (cook, 'hc-cook@example.com');
  o1 := create_organization(owner, 'Cozinha APPCC', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade B') returning id into ub;
  insert into unit_members (unit_id, user_id, role) values (ua, rt, 'technical_lead'), (ua, cook, 'cook');

  -- árvore do Codex
  assert haccp_decision(true, null, true, null, null) = 'ccp', 'Q2 sim → PCC';
  assert haccp_decision(true, null, false, false, null) = 'not_ccp', 'Q3 não → não é PCC';
  assert haccp_decision(true, null, false, true, true) = 'not_ccp', 'Q4 sim → não é PCC';
  assert haccp_decision(true, null, false, true, false) = 'ccp', 'Q4 não → PCC';
  assert haccp_decision(false, true, null, null, null) = 'modify', 'sem controle necessário → modificar';
  assert haccp_decision(false, false, null, null, null) = 'not_ccp', 'sem controle e não necessário';
  assert haccp_decision(true, null, false, null, null) is null, 'incompleta';

  -- ficha "frango assado" com passos → etapas
  insert into tech_sheets (organization_id, name, servings) values (o1.id, 'Frango assado', 10) returning id into sheet;
  insert into tech_sheet_steps (sheet_id, position, text) values (sheet, 1, 'Receber o frango refrigerado');
  insert into tech_sheet_steps (sheet_id, position, text, critical, target_temp) values (sheet, 2, 'Assar até 74 °C no centro', true, 74);
  insert into haccp_plans (unit_id, title, sheet_root_id, status) values (ua, 'APPCC — Frango assado', sheet, 'approved') returning id into plan;
  select * into p from haccp_plans where id = plan;
  assert p.status = 'draft' and p.organization_id = o1.id and p.root_id = plan and p.version = 1, 'nasce rascunho da unidade';
  n := haccp_steps_from_sheet(plan);
  assert n = 2, 'etapas vindas da ficha';
  select id into st_recv from haccp_steps where plan_id = plan and position = 1;
  select id into st_cook from haccp_steps where plan_id = plan and position = 2;
  assert (select target_temp from haccp_steps where id = st_cook) = 74, 'temperatura da etapa';

  insert into haccp_hazards (step_id, kind, description, severity, probability, q1, q2, decision, ccp_number)
  values (st_cook, 'biological', 'Sobrevivência de Salmonella', 3, 2, true, true, 'not_ccp', 7) returning id into hz;
  assert (select decision from haccp_hazards where id = hz) = 'ccp', 'decisão calculada pelo banco';
  insert into haccp_hazards (step_id, kind, description, severity, probability) values (st_recv, 'physical', 'Fragmentos de embalagem', 1, 1);
  assert (select risk from haccp_hazards where step_id = st_recv) = 1, 'risco = severidade × probabilidade';

  ok := false; begin perform haccp_plan_approve(plan, rt);
  exception when raise_exception then ok := sqlerrm like '%PCC sem limite%'; end; assert ok, 'PCC precisa de limite e monitoramento';
  update haccp_hazards set critical_limit = '≥ 74 °C no centro', limit_min = 74, limit_unit = '°C', monitoring_what = 'Temperatura no centro',
         monitoring_kind = 'temperature', corrective_action = 'Continuar a cocção até atingir 74 °C' where id = hz;
  insert into haccp_hazards (step_id, kind, description, severity, probability) values (st_recv, 'biological', 'Multiplicação por temperatura', 2, 2);
  ok := false; begin perform haccp_plan_approve(plan, rt);
  exception when raise_exception then ok := sqlerrm like 'Responda a árvore%'; end; assert ok, 'perigo significativo sem árvore';
  update haccp_hazards set q1 = true, q2 = false, q3 = true, q4 = true where step_id = st_recv and kind = 'biological';

  ok := false; begin perform haccp_plan_approve(plan, cook);
  exception when raise_exception then ok := sqlerrm like 'Só o RT%'; end; assert ok, 'cozinheiro não aprova';
  ok := false; begin update haccp_plans set status = 'approved' where id = plan;
  exception when raise_exception then ok := true; end; assert ok, 'aprovar só pela função';
  p := haccp_plan_approve(plan, rt);
  assert p.status = 'approved', 'aprovado';
  assert (select ccp_number from haccp_hazards where id = hz) = 1, 'PCC 1 numerado';
  ok := false; begin update haccp_hazards set severity = 1 where id = hz;
  exception when raise_exception then ok := true; end; assert ok, 'perigo de plano aprovado não muda';
  ok := false; begin delete from haccp_steps where id = st_recv;
  exception when raise_exception then ok := true; end; assert ok, 'etapa de plano aprovado não se apaga';
  ok := false; begin delete from haccp_plans where id = plan;
  exception when raise_exception then ok := true; end; assert ok, 'plano aprovado não se apaga';

  v2 := haccp_plan_new_version(plan, rt);
  assert (select version from haccp_plans where id = v2) = 2 and (select root_id from haccp_plans where id = v2) = plan, 'nova versão';
  assert (select count(*) from haccp_hazards h join haccp_steps s on s.id = h.step_id where s.plan_id = v2) = 3, 'perigos copiados';
  ok := false; begin perform haccp_plan_new_version(plan, rt);
  exception when raise_exception then ok := true; end; assert ok, 'um rascunho por plano';
  perform haccp_plan_approve(v2, owner);
  assert (select status from haccp_plans where id = plan) = 'archived', 'versão anterior arquivada';

  -- equipamento de outra unidade recusado
  insert into equipment (unit_id, name, kind) values (ub, 'Geladeira B', 'refrigerator') returning id into fridge_b;
  insert into haccp_plans (unit_id, title) values (ua, 'APPCC geral') returning id into plan;
  insert into haccp_steps (plan_id, position, name) values (plan, 1, 'Armazenar') returning id into st_recv;
  ok := false; begin insert into haccp_hazards (step_id, kind, description, severity, probability, equipment_id) values (st_recv, 'biological', 'Temperatura', 2, 2, fridge_b);
  exception when raise_exception then ok := true; end; assert ok, 'equipamento de outra unidade';

  -- ficha de outra empresa recusada
  insert into directus_users (id, email) values (gen_random_uuid(), 'hc-o2@example.com');
  o2 := create_organization((select id from directus_users where email = 'hc-o2@example.com'), 'Outra', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{uan}' where id = o2.id;
  insert into tech_sheets (organization_id, name, servings) values (o2.id, 'Alheia', 1) returning id into sheet;
  ok := false; begin insert into haccp_plans (unit_id, title, sheet_root_id) values (ua, 'X plano', sheet);
  exception when raise_exception then ok := true; end; assert ok, 'ficha de outra empresa';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from haccp_plans where organization_id = o1.id), 'cascata';
end $$;

rollback;
