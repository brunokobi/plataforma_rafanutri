-- Testes da migração 0006 (planos alimentares). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0006_meal_plans.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; v1 uuid; v2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'pl-a@example.com'), (u2, 'pl-b@example.com');
  o1 := create_organization(u1, 'Consultório A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente A') returning id into p1;
  insert into patients (organization_id, full_name) values (o2.id, 'Paciente B') returning id into p2;

  -- rascunho válido
  insert into meal_plans (organization_id, patient_id, meals, user_created)
    values (o1.id, p1, '[{"id":"cafe","name":"Café","time":"07:30","items":[]}]', u1) returning id into v1;

  -- nasce como rascunho
  ok := false;
  begin insert into meal_plans (organization_id, patient_id, status, user_created) values (o1.id, p1, 'published', u1);
  exception when others then ok := sqlerrm like '%nasce como rascunho%'; end;
  assert ok, 'criar já publicado deveria falhar';

  -- paciente de outro consultório e autor de fora
  ok := false;
  begin insert into meal_plans (organization_id, patient_id, user_created) values (o1.id, p2, u1);
  exception when others then ok := sqlerrm like '%não pertence a este consultório%'; end;
  assert ok, 'paciente de outro consultório deveria falhar';
  ok := false;
  begin insert into meal_plans (organization_id, patient_id, user_created) values (o1.id, p1, u2);
  exception when others then ok := sqlerrm like '%owner ou nutricionista%'; end;
  assert ok, 'autor de outro consultório deveria falhar';

  -- rascunho é editável; publicar marca data e validade
  update meal_plans set title = 'Plano de novembro', meals = '[]' where id = v1;
  update meal_plans set status = 'published' where id = v1;
  assert (select published_at is not null and valid_until = current_date + 30 from meal_plans where id = v1), 'publicação marca data e validade';

  -- publicado não muda de conteúdo nem volta a rascunho
  ok := false;
  begin update meal_plans set meals = '[{"id":"x"}]' where id = v1;
  exception when others then ok := sqlerrm like '%crie uma nova versão%'; end;
  assert ok, 'editar publicado deveria falhar';
  ok := false;
  begin update meal_plans set status = 'draft' where id = v1;
  exception when others then ok := sqlerrm like '%não volta a ser rascunho%'; end;
  assert ok, 'publicado voltar a rascunho deveria falhar';

  -- publicar a nova versão arquiva a anterior (um publicado por paciente)
  insert into meal_plans (organization_id, patient_id, user_created) values (o1.id, p1, u1) returning id into v2;
  update meal_plans set status = 'published' where id = v2;
  assert (select status from meal_plans where id = v1) = 'archived', 'anterior arquivado';
  assert (select count(*) from meal_plans where patient_id = p1 and status = 'published') = 1, 'só um publicado';

  -- arquivado não volta
  ok := false;
  begin update meal_plans set status = 'published' where id = v1;
  exception when others then ok := sqlerrm like '%arquivado não volta%'; end;
  assert ok, 'republicar arquivado deveria falhar';

  -- formatos
  ok := false;
  begin insert into meal_plans (organization_id, patient_id, meals, user_created) values (o1.id, p1, '{"nao":"lista"}', u1);
  exception when check_violation then ok := true; end;
  assert ok, 'meals precisa ser uma lista';

  raise notice '0006_meal_plans: todos os testes passaram';
end $$;

rollback;
