-- Testes da migração 0035 (checklists e não conformidades). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0035_checklists.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; ub uuid; tpl uuid; opening uuid; run uuid; run2 uuid; again uuid; ok boolean;
  cid uuid := gen_random_uuid();
  ph uuid := gen_random_uuid();
  stranger uuid := gen_random_uuid();
  r checklist_runs; n integer;
begin
  insert into directus_users (id, email) values (owner, 'ck-owner@example.com'), (cook, 'ck-cook@example.com'), (stranger, 'ck-x@example.com');
  -- directus_files real (produção) exige storage e nome; no banco descartável é só um stub com id
  if exists (select 1 from information_schema.columns where table_name = 'directus_files' and column_name = 'storage') then
    execute format('insert into directus_files (id, storage, filename_download, type) values (%L, ''local'', ''teste.jpg'', ''image/jpeg'')', ph);
  else
    insert into directus_files (id) values (ph);
  end if;
  o1 := create_organization(owner, 'Cozinha Checklists', 'company', null, '1', 'CRN-7');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  insert into production_units (organization_id, name, geo_lat, geo_lng, geo_radius_m) values (o1.id, 'Unidade A', -20.3155, -40.3128, 200) returning id into ua;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade B') returning id into ub;

  -- biblioteca da plataforma
  select id into tpl from checklist_templates where code = 'rdc-216' and organization_id is null;
  assert tpl is not null, 'RDC 216 na biblioteca';
  assert (select count(*) from checklist_template_items where template_id = tpl) = 58, 'RDC 216 com 58 itens';
  assert (select count(*) from checklist_template_items where template_id = tpl and critical) = 7, '7 itens críticos';
  assert not exists (select 1 from checklist_template_items where template_id = tpl and (prompt like '%"%' or prompt ~ '^A (dessalgue|descongelamento)')), 'textos corrigidos';
  select id into opening from checklist_templates where code = 'abertura-cozinha';
  assert (select count(*) from checklist_templates where organization_id is null) >= 3, 'três modelos';

  -- iniciar copia os itens; idempotente pelo client_id; distância até a unidade
  run := checklist_start(ua, opening, cook, cid, -20.3160, -40.3128, 15);
  again := checklist_start(ua, opening, cook, cid, -20.3160, -40.3128, 15);
  assert run = again, 'mesmo client_id, mesma execução';
  select * into r from checklist_runs where id = run;
  assert r.organization_id = o1.id and r.status = 'in_progress' and r.template_name = 'Abertura da cozinha', 'execução aberta';
  assert r.geo_distance_m between 40 and 70, format('distância ~56 m, veio %s', r.geo_distance_m);
  assert (select count(*) from checklist_answers where run_id = run) = 9, 'itens copiados';
  ok := false; begin perform checklist_start(ub, opening, cook, cid);
  exception when raise_exception then ok := true; end; assert ok, 'client_id de outra unidade recusado';

  -- mudar o modelo não muda a execução; o item copiado não muda
  ok := false; begin update checklist_answers set prompt = 'Outro' where run_id = run and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'item copiado imutável';

  -- número: dentro do limite = conforme; fora = não conforme
  update checklist_answers set number_value = 4 where run_id = run and position = 5;
  assert (select value from checklist_answers where run_id = run and position = 5) = 'conform', '4 °C conforme';
  update checklist_answers set number_value = 7 where run_id = run and position = 5;
  assert (select value from checklist_answers where run_id = run and position = 5) = 'non_conform', '7 °C fora do limite';
  update checklist_answers set number_value = -20 where run_id = run and position = 6;
  assert (select value from checklist_answers where run_id = run and position = 6) = 'conform', '-20 °C conforme';

  -- concluir exige todas as respostas
  ok := false; begin perform checklist_complete(run, cook);
  exception when raise_exception then ok := sqlerrm like 'Faltam%'; end; assert ok, 'faltam respostas';
  update checklist_answers set value = 'conform', answered_by = cook where run_id = run and kind = 'compliance';
  update checklist_answers set value = 'na' where run_id = run and position = 9;
  -- item crítico não conforme sem foto e comentário
  ok := false; begin perform checklist_complete(run, cook);
  exception when raise_exception then ok := sqlerrm like '%foto e comentário%'; end; assert ok, 'crítico exige foto e comentário';
  update checklist_answers set comment = 'Porta da geladeira aberta; fechada e chamada a manutenção', photo = ph where run_id = run and position = 5;
  -- concluir direto pelo update é recusado
  ok := false; begin update checklist_runs set status = 'completed' where id = run;
  exception when raise_exception then ok := true; end; assert ok, 'só pela função';

  r := checklist_complete(run, cook);
  assert r.status = 'completed' and r.conform_count = 7 and r.non_conform_count = 1 and r.na_count = 1, 'contagem';
  assert r.score = 87.50, format('pontuação 7/8, veio %s', r.score);
  select count(*) into n from non_conformities where run_id = run;
  assert n = 1, 'uma não conformidade crítica';
  assert exists (select 1 from non_conformities where run_id = run and severity = 'critical' and status = 'open' and photo = ph
                 and due_at between now() + interval '23 hours' and now() + interval '25 hours' and description like '%Valor: 7.00 °C%'), 'NC com prazo de 24 h, foto e valor';

  -- concluído é imutável
  ok := false; begin update checklist_answers set comment = 'mudado' where run_id = run and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'resposta de checklist concluído';
  ok := false; begin update checklist_runs set status = 'cancelled' where id = run;
  exception when raise_exception then ok := true; end; assert ok, 'execução concluída';
  ok := false; begin delete from checklist_answers where run_id = run and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'resposta não se apaga';
  ok := false; begin perform checklist_complete(run, cook);
  exception when raise_exception then ok := true; end; assert ok, 'concluir duas vezes';

  -- cancelar uma execução aberta
  run2 := checklist_start(ua, tpl, cook, gen_random_uuid());
  assert (select geo_distance_m from checklist_runs where id = run2) is null, 'sem localização';
  update checklist_runs set status = 'cancelled' where id = run2;
  ok := false; begin update checklist_answers set value = 'conform' where run_id = run2 and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'cancelado é imutável';

  -- unidade inativa não começa checklist
  update production_units set active = false where id = ub;
  ok := false; begin perform checklist_start(ub, tpl, cook, gen_random_uuid());
  exception when raise_exception then ok := true; end; assert ok, 'unidade inativa';

  -- modelo de outra organização não serve
  insert into checklist_templates (organization_id, name) values ((create_organization(stranger, 'Outra Empresa', 'company', null, '1', 'CRN-8')).id, 'Modelo alheio') returning id into tpl;
  ok := false; begin perform checklist_start(ua, tpl, cook, gen_random_uuid());
  exception when raise_exception then ok := true; end; assert ok, 'modelo de outra organização';

  -- auditoria
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'checklist_runs' and action = 'update'), 'execução auditada';
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'non_conformities' and action = 'insert'), 'NC auditada';

  -- apagar a organização leva tudo
  delete from organizations where id = o1.id;
  assert not exists (select 1 from checklist_runs where organization_id = o1.id), 'execuções em cascata';
  assert not exists (select 1 from non_conformities where organization_id = o1.id), 'NCs em cascata';
end $$;

rollback;
