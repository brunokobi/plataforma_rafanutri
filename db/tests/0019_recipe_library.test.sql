-- Testes da migração 0019 (biblioteca de receitas e envio ao paciente). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0019_recipe_library.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  custom int; pub int; r1 int; rb int; f1 int; p1 uuid; p2 uuid; pa uuid; s1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'rc-a@example.com'), (u2, 'rc-b@example.com');
  o1 := create_organization(u1, 'Consultório Receitas A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Receitas B', 'solo', null, '2', 'CRN-2');
  select id into custom from food_sources where code = 'CUSTOM';
  insert into food_sources (code, name) values ('TESTE_PUB', 'Base pública de teste') on conflict (code) do nothing;
  insert into foods (source_id, source_code, name) values ((select id from food_sources where code = 'TESTE_PUB'), 'r1', 'Aveia pública') returning id into pub;
  insert into foods (source_id, organization_id, name, user_created, kind) values (custom, o1.id, 'Panqueca de aveia', u1, 'recipe') returning id into r1;
  insert into foods (source_id, organization_id, name, user_created, kind) values (custom, o2.id, 'Bolo de B', u2, 'recipe') returning id into rb;
  insert into foods (source_id, organization_id, name, user_created) values (custom, o1.id, 'Barra A', u1) returning id into f1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;
  insert into patients (organization_id, responsible_user_id, full_name, status) values (o1.id, u1, 'Arquivado', 'archived') returning id into pa;

  -- Campos novos da receita
  insert into recipes (food_id, yield_g, servings, items, description, prep_minutes, difficulty, tags)
    values (r1, 300, 3, jsonb_build_array(jsonb_build_object('foodId', pub, 'quantityG', 80)), 'Café da manhã rápido', 15, 'easy', '["café da manhã", "sem lactose"]');
  ok := false; begin update recipes set difficulty = 'impossível' where food_id = r1;
  exception when check_violation then ok := true; end; assert ok, 'dificuldade inválida deveria falhar';
  ok := false; begin update recipes set prep_minutes = 0 where food_id = r1;
  exception when check_violation then ok := true; end; assert ok, 'tempo zero deveria falhar';
  ok := false; begin update recipes set tags = '{"a":1}' where food_id = r1;
  exception when check_violation then ok := true; end; assert ok, 'tags fora de lista deveriam falhar';
  ok := false; begin update recipes set description = repeat('x', 601) where food_id = r1;
  exception when check_violation then ok := true; end; assert ok, 'descrição longa deveria falhar';

  -- Envio ao paciente
  insert into patient_recipes (organization_id, patient_id, recipe_food_id, note, user_created) values (o1.id, p1, r1, 'Para o lanche', u1) returning id into s1;
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, p1, r1, u1);
  exception when unique_violation then ok := true; end; assert ok, 'um envio por receita e paciente';
  insert into patient_recipes (organization_id, patient_id, recipe_food_id, note, user_created) values (o1.id, p1, r1, 'Nova observação', u1)
    on conflict (patient_id, recipe_food_id) do update set note = excluded.note;
  assert (select note = 'Nova observação' and date_updated is not null from patient_recipes where id = s1), 'reenviar atualiza a observação';
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, p1, rb, u1);
  exception when others then ok := sqlerrm like '%próprio consultório%'; end; assert ok, 'receita de outro consultório deveria falhar';
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, p1, f1, u1);
  exception when others then ok := sqlerrm like '%próprio consultório%'; end; assert ok, 'alimento que não é receita deveria falhar';
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, p2, r1, u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente de outro consultório deveria falhar';
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, pa, r1, u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente arquivado deveria falhar';
  ok := false; begin insert into patient_recipes (organization_id, patient_id, recipe_food_id, user_created) values (o1.id, p1, r1, u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin update patient_recipes set patient_id = pa where id = s1;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'envio não muda de paciente';

  -- Receita apagada leva o envio junto
  delete from foods where id = r1;
  assert not exists (select 1 from patient_recipes where id = s1), 'cascata do envio';

  raise notice '0019_recipe_library: todos os testes passaram';
end $$;

rollback;
