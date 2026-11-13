-- Testes da migração 0014 (orientações reutilizáveis). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0014_text_snippets.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  t1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'tx-a@example.com'), (u2, 'tx-b@example.com');
  o1 := create_organization(u1, 'Consultório Textos A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Textos B', 'solo', null, '2', 'CRN-2');

  insert into text_snippets (organization_id, category, title, body, user_created)
    values (o1.id, ' Hidratação ', ' Água ao longo do dia ', ' Beba água ao longo do dia. ', u1) returning id into t1;
  assert (select category = 'Hidratação' and title = 'Água ao longo do dia' and body = 'Beba água ao longo do dia.' from text_snippets where id = t1), 'campos deveriam ser aparados';

  ok := false; begin insert into text_snippets (organization_id, category, title, body, user_created) values (o1.id, 'Cat', 'Intruso', 'Texto', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin insert into text_snippets (organization_id, category, title, body) values (o1.id, 'Cat', 'Sem autor', 'Texto');
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'sem autor deveria falhar';
  ok := false; begin insert into text_snippets (category, title, body, user_created) values ('Cat', 'Biblioteca falsa', 'Texto', u1);
  exception when others then ok := sqlerrm like '%biblioteca da plataforma%'; end; assert ok, 'usuário criando texto da plataforma deveria falhar';
  insert into text_snippets (category, title, body) values ('Geral', 'Seed', 'Texto da plataforma');  -- seed: permitido

  ok := false; begin update text_snippets set organization_id = o2.id where id = t1;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end; assert ok, 'mudar de consultório deveria falhar';
  update text_snippets set body = 'Beba 2 litros de água por dia.' where id = t1;
  assert (select date_updated is not null from text_snippets where id = t1), 'date_updated deveria ser preenchido';

  ok := false; begin insert into text_snippets (organization_id, category, title, body, user_created) values (o1.id, 'Cat', 'Vazio', ' ', u1);
  exception when check_violation then ok := true; end; assert ok, 'texto vazio deveria falhar';

  raise notice '0014_text_snippets: todos os testes passaram';
end $$;

rollback;
