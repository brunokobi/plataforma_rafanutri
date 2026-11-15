-- 0032 — product_feedback: aceita o válido, recusa mensagem vazia/longa, tipo e página inválidos.
begin;
do $$
declare
  u uuid := gen_random_uuid();
  o uuid;
begin
  insert into directus_users (id, email) values (u, 'fb@example.com');
  o := (create_organization(u, 'Consultório FB', 'solo', null, '1', 'CRN-1')).id;

  insert into product_feedback (organization_id, user_id, kind, message, page) values (o, u, 'bug', 'O botão não salva', '/app/agenda');
  insert into product_feedback (user_id, message) values (u, 'sem consultório ainda');
  assert (select count(*) from product_feedback where user_id = u) = 2, 'grava feedback com e sem consultório';
  assert (select status from product_feedback where page = '/app/agenda' and user_id = u) = 'new', 'status inicial new';

  begin insert into product_feedback (user_id, message) values (u, '  '); raise exception 'aceitou vazio';
  exception when check_violation then null; end;
  begin insert into product_feedback (user_id, message) values (u, repeat('a', 2001)); raise exception 'aceitou longo';
  exception when check_violation then null; end;
  begin insert into product_feedback (user_id, kind, message) values (u, 'spam', 'texto ok'); raise exception 'aceitou tipo';
  exception when check_violation then null; end;
  begin insert into product_feedback (user_id, message, page) values (u, 'texto ok', '/app/x?cpf=1'); raise exception 'aceitou query';
  exception when check_violation then null; end;
  begin insert into product_feedback (user_id, message, page) values (u, 'texto ok', 'https://x'); raise exception 'aceitou url';
  exception when check_violation then null; end;

  delete from organizations where id = o;
  assert (select count(*) from product_feedback where user_id = u) = 1, 'apagar o consultório leva o feedback dele';
  delete from product_feedback where user_id = u;
  delete from directus_users where id = u;
end $$;
rollback;
