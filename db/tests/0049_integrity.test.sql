-- Testes da migração 0049 (integridade dos registros de qualidade). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; opening uuid; run uuid; r checklist_runs; ok boolean; bad integer; fridge uuid;
begin
  insert into directus_users (id, email) values (owner, 'in-owner@example.com'), (cook, 'in-cook@example.com');
  o1 := create_organization(owner, 'Cozinha Integridade', 'company', null, '1', 'CRN-9');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into unit_members (unit_id, user_id, role) values (ua, cook, 'cook');
  select id into opening from checklist_templates where code = 'abertura-cozinha';

  run := checklist_start(ua, opening, cook, gen_random_uuid(), null, null, null);
  ok := false; begin update checklist_runs set content_hash = 'x' where id = run; ok := (select content_hash from checklist_runs where id = run) is null;
  exception when raise_exception then ok := true; end; assert ok, 'hash não é gravado à mão';
  update checklist_answers set value = 'conform', answered_by = cook, answered_at = now() where run_id = run and kind = 'compliance';
  update checklist_answers set number_value = coalesce(min_value, max_value, 0), answered_by = cook, answered_at = now() where run_id = run and kind = 'number';
  r := checklist_complete(run, cook);
  assert r.content_hash ~ '^[0-9a-f]{64}$', 'hash gravado na conclusão';
  assert r.content_hash = checklist_run_digest(r), 'hash confere';
  assert (select bool_and(c.ok) from uan_integrity_check(ua, current_date - 1, current_date + 1) c), 'integridade ok';

  -- conta apagada (FK set null) não quebra o hash
  delete from unit_members where user_id = cook;
  delete from directus_users where id = cook; -- FK set null em respostas e execução
  assert (select bool_and(c.ok) from uan_integrity_check(ua, current_date - 1, current_date + 1) c where c.kind = 'checklist'), 'FK set null mantém o hash';

  -- adulteração direta no banco (gatilhos desligados) é apontada
  set local session_replication_role = replica;
  update checklist_answers set comment = 'adulterado' where run_id = run and position = 1;
  set local session_replication_role = origin;
  select count(*) into bad from uan_integrity_check(ua, current_date - 1, current_date + 1) c where not c.ok;
  assert bad = 1, format('divergência apontada, veio %s', bad);

  -- sem delete físico
  ok := false; begin delete from checklist_runs where id = run;
  exception when raise_exception then ok := sqlerrm = 'Registro de qualidade não se apaga'; end; assert ok, 'checklist não se apaga';
  insert into equipment (unit_id, name, kind) values (ua, 'Geladeira', 'refrigerator') returning id into fridge;
  insert into temperature_readings (unit_id, equipment_id, value, client_id, recorded_by) values (ua, fridge, 3, gen_random_uuid(), owner);
  ok := false; begin delete from temperature_readings where equipment_id = fridge;
  exception when raise_exception then ok := true; end; assert ok, 'leitura não se apaga';

  -- auditoria nos lotes
  assert exists (select 1 from pg_trigger where tgname = 'stock_lots_audit'), 'auditoria em stock_lots';

  -- cascata com a empresa continua funcionando
  delete from organizations where id = o1.id;
  assert not exists (select 1 from checklist_runs where id = run), 'cascata';
end $$;

rollback;
