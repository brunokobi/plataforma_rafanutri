-- Testes da migração 0017 (lista de interesse no plano pago). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0017_plan_waitlist.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'wl-a@example.com'), (u2, 'wl-b@example.com');
  o1 := create_organization(u1, 'Consultório Interesse A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Interesse B', 'solo', null, '2', 'CRN-2');

  insert into plan_waitlist (organization_id, user_id, desired_plan, note, active_patients) values (o1.id, u1, 'professional', '  ', 20);
  assert (select note is null and desired_plan = 'professional' from plan_waitlist where organization_id = o1.id), 'nota vazia vira null';

  ok := false; begin insert into plan_waitlist (organization_id, user_id) values (o2.id, u1);
  exception when others then ok := sqlerrm like '%Só o owner%'; end; assert ok, 'quem não é owner não registra';
  ok := false; begin insert into plan_waitlist (organization_id) values (o2.id);
  exception when others then ok := sqlerrm like '%Só o owner%'; end; assert ok, 'sem usuário não registra';
  ok := false; begin insert into plan_waitlist (organization_id, user_id, desired_plan) values (o2.id, u2, 'enterprise');
  exception when check_violation then ok := true; end; assert ok, 'plano desconhecido falha';
  ok := false; begin insert into plan_waitlist (organization_id, user_id) values (o1.id, u1);
  exception when unique_violation then ok := true; end; assert ok, 'um registro por consultório';

  update plan_waitlist set desired_plan = 'clinic', date_created = '2000-01-01' where organization_id = o1.id;
  assert (select desired_plan = 'clinic' and date_created > '2020-01-01' and date_updated is not null from plan_waitlist where organization_id = o1.id), 'atualiza mantendo a data do interesse';
  ok := false; begin update plan_waitlist set organization_id = o2.id where organization_id = o1.id;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end; assert ok, 'não muda de consultório';

  raise notice '0017_plan_waitlist: todos os testes passaram';
end $$;

rollback;
