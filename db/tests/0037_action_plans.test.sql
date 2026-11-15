-- Testes da migração 0037 (quadro de não conformidades e 5W2H). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0037_action_plans.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  ph uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; nc uuid; p1 uuid; p2 uuid; ok boolean; r non_conformities;
begin
  insert into directus_users (id, email) values (owner, 'ap-owner@example.com'), (cook, 'ap-cook@example.com');
  if exists (select 1 from information_schema.columns where table_name = 'directus_files' and column_name = 'storage') then
    execute format('insert into directus_files (id, storage, filename_download, type) values (%L, ''local'', ''teste.jpg'', ''image/jpeg'')', ph);
  else
    insert into directus_files (id) values (ph);
  end if;
  o1 := create_organization(owner, 'Cozinha Planos', 'company', null, '1', 'CRN-5');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;

  -- NC manual: nasce aberta, prazo pela severidade, situação não se força
  insert into non_conformities (unit_id, source, title, severity, opened_by, status) values (ua, 'manual', 'Ralo entupido na área de cocção', 'medium', cook, 'closed') returning id into nc;
  select * into r from non_conformities where id = nc;
  assert r.status = 'open' and r.organization_id = o1.id, 'aberta, da organização da unidade';
  assert r.due_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour', 'média: 7 dias';
  ok := false; begin update non_conformities set status = 'resolved' where id = nc;
  exception when raise_exception then ok := true; end; assert ok, 'situação acompanha os planos';
  ok := false; begin update non_conformities set status = 'closed' where id = nc;
  exception when raise_exception then ok := true; end; assert ok, 'fechar só por nc_close';

  -- plano 5W2H: em tratamento; exige responsável
  ok := false; begin insert into action_plans (non_conformity_id, what, due_date) values (nc, 'Desentupir', current_date + 1);
  exception when check_violation then ok := true; end; assert ok, 'quem é obrigatório';
  insert into action_plans (non_conformity_id, what, why, where_, due_date, who_user, how, how_much_cents, created_by)
    values (nc, 'Desentupir o ralo', 'Acúmulo de gordura', 'Cocção', current_date + 1, cook, 'Chamar desentupidora', 25000, owner) returning id into p1;
  assert (select status from non_conformities where id = nc) = 'in_progress', 'em tratamento';
  assert (select organization_id from action_plans where id = p1) = o1.id, 'organização da NC';
  insert into action_plans (non_conformity_id, what, due_date, who_text, created_by) values (nc, 'Limpar a caixa de gordura semanalmente', current_date + 7, 'Equipe da limpeza', owner) returning id into p2;

  -- fechar antes de concluir os planos
  ok := false; begin perform nc_close(nc, owner, 'Verificado', ph);
  exception when raise_exception then ok := sqlerrm like 'Conclua os planos%'; end; assert ok, 'planos pendentes';

  update action_plans set status = 'done', done_by = cook, done_note = 'Feito' where id = p1;
  assert (select status from non_conformities where id = nc) = 'in_progress', 'um plano ainda pendente';
  update action_plans set status = 'done', done_by = owner where id = p2;
  assert (select status from non_conformities where id = nc) = 'resolved', 'todos concluídos: resolvida';
  ok := false; begin update action_plans set what = 'Outra coisa' where id = p1;
  exception when raise_exception then ok := true; end; assert ok, 'plano concluído não muda';
  ok := false; begin delete from action_plans where id = p1;
  exception when raise_exception then ok := true; end; assert ok, 'plano concluído não se apaga';

  -- plano novo numa resolvida volta para em tratamento; apagar plano pendente volta para resolvida
  insert into action_plans (non_conformity_id, what, due_date, who_text) values (nc, 'Treinar equipe', current_date + 3, 'RT') returning id into p2;
  assert (select status from non_conformities where id = nc) = 'in_progress', 'reaberta pelo plano';
  delete from action_plans where id = p2;
  assert (select status from non_conformities where id = nc) = 'resolved', 'volta a resolvida';

  -- fechar exige foto e nota
  ok := false; begin perform nc_close(nc, owner, 'Verificado', null);
  exception when raise_exception then ok := sqlerrm like '%foto da evidência%'; end; assert ok, 'sem foto';
  ok := false; begin perform nc_close(nc, owner, '  ', ph);
  exception when raise_exception then ok := sqlerrm like '%verificação de eficácia%'; end; assert ok, 'sem nota';
  r := nc_close(nc, owner, 'Ralo sem retorno após 48 h; caixa limpa', ph);
  assert r.status = 'closed' and r.closed_by = owner and r.closing_photo = ph and r.closed_at is not null, 'fechada';

  -- fechada é definitiva
  ok := false; begin update non_conformities set title = 'Mudado' where id = nc;
  exception when raise_exception then ok := true; end; assert ok, 'fechada não muda';
  ok := false; begin insert into action_plans (non_conformity_id, what, due_date, who_text) values (nc, 'Mais um', current_date, 'RT');
  exception when raise_exception then ok := true; end; assert ok, 'fechada não recebe plano';
  ok := false; begin perform nc_close(nc, owner, 'De novo', ph);
  exception when raise_exception then ok := true; end; assert ok, 'fechar duas vezes';

  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'action_plans' and action = 'insert'), 'plano auditado';
  delete from organizations where id = o1.id;
  assert not exists (select 1 from action_plans where organization_id = o1.id), 'planos em cascata';
end $$;

rollback;
