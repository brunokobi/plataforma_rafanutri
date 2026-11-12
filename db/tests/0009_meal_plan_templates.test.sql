-- Testes das migrações 0009 e 0010 (modelos de plano; etiquetas em jsonb). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0009_meal_plan_templates.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; pb uuid; plan_a uuid; plan_b uuid; t1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'mt-a@example.com'), (u2, 'mt-b@example.com');
  o1 := create_organization(u1, 'Consultório Modelos A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Modelos B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, full_name) values (o2.id, 'Paciente de B') returning id into pb;
  insert into meal_plans (organization_id, patient_id, user_created) values (o1.id, p1, u1) returning id into plan_a;
  insert into meal_plans (organization_id, patient_id, user_created) values (o2.id, pb, u2) returning id into plan_b;

  -- cria a partir de um plano do consultório; tags normalizadas
  insert into meal_plan_templates (organization_id, name, tags, meals, energy_kcal, source_plan_id, user_created)
    values (o1.id, 'Low carb 1600', '[" Low Carb", "low carb", "", "Emagrecimento "]', '[{"id":"cafe","name":"Café","time":"07:00","items":[]}]', 1600, plan_a, u1)
    returning id into t1;
  assert (select tags = '["emagrecimento", "low carb"]'::jsonb from meal_plan_templates where id = t1), 'tags deveriam ser aparadas, em minúsculas, sem vazias nem repetidas';

  -- plano de origem de outro consultório
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, source_plan_id, user_created) values (o1.id, 'Copiado de B', plan_b, u1);
  exception when others then ok := sqlerrm like '%origem não é deste consultório%'; end;
  assert ok, 'plano de outro consultório como origem deveria falhar';

  -- autor de fora do consultório
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, user_created) values (o1.id, 'Intruso', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end;
  assert ok, 'autor de fora deveria falhar';

  -- não muda de consultório; edição marca date_updated
  ok := false;
  begin update meal_plan_templates set organization_id = o2.id where id = t1;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end;
  assert ok, 'mudar de consultório deveria falhar';
  update meal_plan_templates set name = 'Low carb 1.600 kcal' where id = t1;
  assert (select date_updated is not null from meal_plan_templates where id = t1), 'date_updated deveria ser preenchido';

  -- limites
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, tags, user_created) values (o1.id, 'Muitas tags', '["a","b","c","d","e","f","g","h","i","j","k"]', u1);
  exception when check_violation then ok := true; end;
  assert ok, 'mais de 10 tags deveria falhar';
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, tags, user_created) values (o1.id, 'Tag longa', jsonb_build_array(repeat('x', 31)), u1);
  exception when others then ok := sqlerrm like '%muito longa%'; end;
  assert ok, 'tag com mais de 30 caracteres deveria falhar';

  -- etiquetas precisam ser lista de textos
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, tags, user_created) values (o1.id, 'Tag número', '[1]', u1);
  exception when others then ok := sqlerrm like '%devem ser textos%'; end;
  assert ok, 'etiqueta que não é texto deveria falhar';

  -- usuário não cria modelo da biblioteca (sem consultório) (0011)
  ok := false;
  begin insert into meal_plan_templates (organization_id, name, user_created) values (null, 'Biblioteca falsa', u1);
  exception when others then ok := sqlerrm like '%só podem ser criados pela equipe%'; end;
  assert ok, 'usuário criando modelo sem consultório deveria falhar';

  -- apagar o plano de origem não apaga o modelo
  delete from meal_plans where id = plan_a;
  assert (select source_plan_id is null from meal_plan_templates where id = t1), 'modelo deveria ficar sem origem';

  raise notice '0009_meal_plan_templates: todos os testes passaram';
end $$;

rollback;
