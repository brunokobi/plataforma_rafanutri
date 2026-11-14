-- Testes da migração 0031 (expediente do consultório). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0031_work_schedule.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  o1 organizations; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'exp-a@example.com');
  o1 := create_organization(u1, 'Consultório Expediente', 'solo', null, '1', 'CRN-1');
  assert o1.work_start = '08:00' and o1.work_end = '18:00' and o1.work_weekdays = '{1,2,3,4,5,6,7}', 'padrão';

  update organizations set work_start = '07:30', work_end = '19:00', work_weekdays = '{1,3,5}' where id = o1.id;
  ok := false; begin update organizations set work_start = '19:00', work_end = '07:00' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'fim antes do início';
  ok := false; begin update organizations set work_weekdays = '{0,8}' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'dia inválido';
  ok := false; begin update organizations set work_weekdays = '{}' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'nenhum dia';

  raise notice '0031_work_schedule: todos os testes passaram';
end $$;

rollback;
