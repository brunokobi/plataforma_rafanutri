-- Testes da migração 0013 (alimentos próprios e preparações). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0013_custom_foods_recipes.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  custom int; taco int; f1 int; fb int; r1 int; pub int; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'fd-a@example.com'), (u2, 'fd-b@example.com');
  o1 := create_organization(u1, 'Consultório Alimentos A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Alimentos B', 'solo', null, '2', 'CRN-2');
  select id into custom from food_sources where code = 'CUSTOM';
  assert custom is not null, 'fonte CUSTOM deveria existir';
  insert into food_sources (code, name) values ('TESTE_PUB', 'Base pública de teste') on conflict (code) do nothing;
  select id into taco from food_sources where code = 'TESTE_PUB';
  insert into foods (source_id, source_code, name) values (taco, 'x1', 'Arroz público') returning id into pub;

  -- alimento do consultório: fonte CUSTOM e autor do consultório
  insert into foods (source_id, organization_id, name, user_created) values (custom, o1.id, 'Barra de proteína X', u1) returning id into f1;
  insert into foods (source_id, organization_id, name, user_created) values (custom, o2.id, 'Granola de B', u2) returning id into fb;
  ok := false; begin insert into foods (source_id, organization_id, name, user_created) values (taco, o1.id, 'Fonte errada', u1);
  exception when others then ok := sqlerrm like '%fonte CUSTOM%'; end; assert ok, 'alimento de consultório fora da fonte CUSTOM deveria falhar';
  ok := false; begin insert into foods (source_id, organization_id, name, user_created) values (custom, o1.id, 'Intruso', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin insert into foods (source_id, organization_id, name) values (custom, o1.id, 'Sem autor');
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'alimento sem autor deveria falhar';

  -- base pública: só por seed (sem autor)
  ok := false; begin insert into foods (source_id, name, user_created) values (taco, 'Público por usuário', u1);
  exception when others then ok := sqlerrm like '%base pública%'; end; assert ok, 'usuário criando alimento público deveria falhar';

  -- não muda de consultório nem de tipo; arquivar funciona
  ok := false; begin update foods set organization_id = o2.id where id = f1;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end; assert ok, 'mudar de consultório deveria falhar';
  ok := false; begin update foods set kind = 'recipe' where id = f1;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end; assert ok, 'mudar de tipo deveria falhar';
  update foods set archived = true where id = f1;
  assert (select archived and updated_at is not null from foods where id = f1), 'arquivar deveria funcionar';
  update foods set archived = false where id = f1;

  -- preparação: ingredientes da base pública ou do próprio consultório
  insert into foods (source_id, organization_id, name, kind, user_created) values (custom, o1.id, 'Bolo de banana', 'recipe', u1) returning id into r1;
  insert into recipes (food_id, yield_g, items) values (r1, 500, jsonb_build_array(jsonb_build_object('foodId', pub, 'quantityG', 200), jsonb_build_object('foodId', f1, 'quantityG', 50)));
  ok := false; begin update recipes set items = jsonb_build_array(jsonb_build_object('foodId', fb, 'quantityG', 10)) where food_id = r1;
  exception when others then ok := sqlerrm like '%Ingrediente inválido%'; end; assert ok, 'ingrediente de outro consultório deveria falhar';
  ok := false; begin update recipes set items = jsonb_build_array(jsonb_build_object('foodId', r1, 'quantityG', 10)) where food_id = r1;
  exception when others then ok := sqlerrm like '%Ingrediente inválido%'; end; assert ok, 'preparação como ingrediente de si mesma deveria falhar';
  ok := false; begin update recipes set items = jsonb_build_array(jsonb_build_object('foodId', pub, 'quantityG', 0)) where food_id = r1;
  exception when others then ok := sqlerrm like '%Ingrediente inválido%'; end; assert ok, 'quantidade zero deveria falhar';
  ok := false; begin insert into recipes (food_id, yield_g, items) values (f1, 100, jsonb_build_array(jsonb_build_object('foodId', pub, 'quantityG', 10)));
  exception when others then ok := sqlerrm like '%tipo preparação%'; end; assert ok, 'receita em alimento comum deveria falhar';
  ok := false; begin insert into foods (source_id, name, kind) values (taco, 'Preparação pública', 'recipe');
  exception when others then ok := sqlerrm like '%precisa pertencer a um consultório%'; end; assert ok, 'preparação pública deveria falhar';

  -- apagar o alimento leva a receita junto
  delete from foods where id = r1;
  assert not exists (select 1 from recipes where food_id = r1), 'receita deveria sumir com o alimento';

  raise notice '0013_custom_foods_recipes: todos os testes passaram';
end $$;

rollback;
