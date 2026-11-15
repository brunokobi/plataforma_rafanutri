-- Testes da migração 0038 (editor de modelos e agenda de checklists). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0038_checklist_editor.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; lib uuid; mine uuid; theirs uuid; sch uuid; run uuid; ok boolean; n integer;
  monday_9 timestamptz := '2026-11-16 12:00:00+00'; -- segunda, 09:00 em São Paulo
begin
  insert into directus_users (id, email) values (owner, 'ed-owner@example.com'), (other, 'ed-other@example.com');
  o1 := create_organization(owner, 'Cozinha Editor', 'company', null, '1', 'CRN-4');
  o2 := create_organization(other, 'Outra Cozinha', 'company', null, '1', 'CRN-3');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  select id into lib from checklist_templates where code = 'higiene-manipuladores' and organization_id is null;

  -- biblioteca é só leitura
  ok := false; begin update checklist_templates set name = 'Mudado' where id = lib;
  exception when raise_exception then ok := true; end; assert ok, 'modelo da biblioteca não muda';
  ok := false; begin update checklist_template_items set prompt = 'Mudado' where template_id = lib and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'item da biblioteca não muda';
  ok := false; begin delete from checklist_template_items where template_id = lib and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'item da biblioteca não se apaga';
  ok := false; begin insert into checklist_template_items (template_id, position, prompt) values (lib, 99, 'Novo item');
  exception when raise_exception then ok := true; end; assert ok, 'biblioteca não ganha item';
  ok := false; begin insert into checklist_templates (code, name) values ('pirata', 'Pirata');
  exception when raise_exception then ok := true; end; assert ok, 'ninguém cria modelo de biblioteca';

  -- cópia para a empresa: itens iguais, origem guardada, editável
  mine := checklist_template_copy(lib, o1.id, owner);
  assert (select (organization_id, source_template_id, name) from checklist_templates where id = mine) = (o1.id, lib, 'Higiene dos manipuladores — personalizado'::text), 'cópia';
  assert (select count(*) from checklist_template_items where template_id = mine) = (select count(*) from checklist_template_items where template_id = lib), 'mesmos itens';
  update checklist_template_items set prompt = 'Touca e máscara em uso?' where template_id = mine and position = 3;
  insert into checklist_template_items (template_id, position, prompt, critical) values (mine, 9, 'Termômetro calibrado?', true);
  update checklist_templates set name = 'Higiene — turno da manhã' where id = mine;
  assert (select updated_at from checklist_templates where id = mine) is not null, 'updated_at';
  -- cópia de modelo de outra empresa: recusada
  theirs := checklist_template_copy(lib, o2.id, other);
  ok := false; begin perform checklist_template_copy(theirs, o1.id, owner);
  exception when raise_exception then ok := true; end; assert ok, 'modelo alheio';
  ok := false; begin update checklist_templates set organization_id = o2.id where id = mine;
  exception when raise_exception then ok := true; end; assert ok, 'não muda de empresa';

  -- execução usa a versão do momento
  run := checklist_start(ua, mine, owner, gen_random_uuid());
  assert (select count(*) from checklist_answers where run_id = run) = 9, '9 itens na execução';
  delete from checklist_template_items where template_id = mine and position = 9;
  assert (select count(*) from checklist_answers where run_id = run) = 9, 'apagar item do modelo não muda a execução';

  -- agenda: segunda e quarta às 07:00, tolerância 60 min
  insert into checklist_schedules (unit_id, template_id, weekdays, at_time, tolerance_minutes) values (ua, mine, '{3,1,1}', '07:00', 60) returning id into sch;
  assert (select (organization_id, weekdays) from checklist_schedules where id = sch) = (o1.id, '{1,3}'::smallint[]), 'organização e dias normalizados';
  ok := false; begin insert into checklist_schedules (unit_id, template_id, weekdays, at_time) values (ua, theirs, '{1}', '07:00');
  exception when raise_exception then ok := true; end; assert ok, 'agenda com modelo alheio';
  ok := false; begin insert into checklist_schedules (unit_id, template_id, weekdays, at_time) values (ua, mine, '{8}', '07:00');
  exception when check_violation then ok := true; end; assert ok, 'dia inválido';

  -- segunda 09:00 sem execução de hoje: atrasado (07:00 + 60 min); a execução de "agora" é de outro dia
  assert (select status from checklist_day(ua, monday_9)) = 'overdue', 'atrasado';
  assert (select status from checklist_day(ua, '2026-11-16 10:30:00+00')) = 'pending', '07:30: ainda no prazo';
  assert not exists (select 1 from checklist_day(ua, '2026-11-17 12:00:00+00')), 'terça: nada agendado';
  -- execução concluída na segunda conta como feita
  alter table checklist_runs disable trigger checklist_runs_guard;
  update checklist_runs set started_at = '2026-11-16 10:15:00+00' where id = run;
  alter table checklist_runs enable trigger checklist_runs_guard;
  assert (select (status, run_id) from checklist_day(ua, monday_9)) = ('in_progress'::text, run), 'iniciado hoje';
  update checklist_answers set value = 'conform' where run_id = run;
  perform checklist_complete(run, owner);
  assert (select status from checklist_day(ua, monday_9)) = 'done', 'feito';
  -- apagar item de modelo usado por checklist concluído: a resposta fica, sem a referência
  delete from checklist_template_items where template_id = mine and position = 1;
  assert (select (item_id is null, value) from checklist_answers where run_id = run and position = 1) = (true, 'conform'::text), 'resposta preservada';

  -- apagar a organização leva modelos e agenda
  delete from organizations where id = o1.id;
  assert not exists (select 1 from checklist_templates where organization_id = o1.id), 'modelos em cascata';
  assert not exists (select 1 from checklist_schedules where organization_id = o1.id), 'agenda em cascata';
  select count(*) into n from checklist_template_items where template_id = lib;
  assert n = 8, 'biblioteca intacta';
end $$;

rollback;
