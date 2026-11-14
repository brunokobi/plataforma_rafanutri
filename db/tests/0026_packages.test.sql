-- Testes da migração 0026 (pacotes de consultas). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0026_packages.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; sp uuid; pp uuid; pp2 uuid; old_pp uuid; a uuid[] := '{}'; x uuid; i int; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'pac-a@example.com'), (u2, 'pac-b@example.com');
  o1 := create_organization(u1, 'Consultório Pacote A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Pacote B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;

  -- Catálogo
  insert into service_packages (organization_id, name, sessions, price_cents, validity_days, user_created)
    values (o1.id, ' Trimestral ', 3, 60000, 90, u1) returning id into sp;
  assert (select name = 'Trimestral' from service_packages where id = sp), 'nome aparado';
  ok := false; begin insert into service_packages (organization_id, name, sessions, price_cents, user_created) values (o1.id, 'Intruso', 3, 100, u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'outro consultório não cria';

  -- Venda
  insert into patient_packages (organization_id, patient_id, package_id, name, sessions_total, sessions_used, price_cents, expires_at, user_created)
    values (o1.id, p1, sp, 'Trimestral', 3, 2, 60000, current_date + 90, u1) returning id into pp;
  assert (select sessions_used = 0 and status = 'active' from patient_packages where id = pp), 'nasce ativo sem sessões usadas';
  ok := false; begin insert into patient_packages (organization_id, patient_id, name, sessions_total, price_cents, user_created) values (o1.id, p2, 'X pacote', 1, 100, u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente de outro consultório';

  -- Três consultas concluídas consomem o pacote (ligadas sozinhas) e ele fica finished
  for i in 1..4 loop
    insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
      values (o1.id, p1, u1, now() + make_interval(days => i), now() + make_interval(days => i, hours => 1), u1) returning id into x;
    a := a || x;
  end loop;
  update appointments set status = 'completed' where id = a[1];
  assert (select patient_package_id = pp from appointments where id = a[1]), 'ligada ao pacote ao concluir';
  assert (select sessions_used = 1 from patient_packages where id = pp), '1 usada';
  update appointments set status = 'completed' where id in (a[2], a[3]);
  assert (select sessions_used = 3 and status = 'finished' from patient_packages where id = pp), 'finished após 3';

  -- 4ª consulta: não usa o pacote (sem outro pacote, conclui sem pacote); ligar à força é recusado
  update appointments set status = 'completed' where id = a[4];
  assert (select patient_package_id is null from appointments where id = a[4]), '4ª sem pacote';
  update appointments set status = 'scheduled' where id = a[4];
  ok := false; begin update appointments set patient_package_id = pp, status = 'completed' where id = a[4];
  exception when others then ok := sqlerrm like '%todas as sessões%'; end; assert ok, '4ª não usa pacote cheio';

  -- Conclusão revertida devolve a sessão
  update appointments set status = 'scheduled' where id = a[3];
  assert (select sessions_used = 2 and status = 'active' from patient_packages where id = pp), 'revertida: 2 usadas, ativo de novo';
  update appointments set status = 'completed' where id = a[3];
  assert (select sessions_used = 3 and status = 'finished' from patient_packages where id = pp), 'conclui de novo';

  -- Pacote de outro paciente não serve
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o2.id, p2, u2, now() + interval '10 days', now() + interval '10 days 1 hour', u2) returning id into x;
  ok := false; begin update appointments set patient_package_id = pp where id = x;
  exception when others then ok := sqlerrm like '%outro paciente%'; end; assert ok, 'pacote de outro paciente';

  -- Vencido: não é escolhido e expire_patient_packages marca
  insert into patient_packages (organization_id, patient_id, name, sessions_total, price_cents, expires_at, user_created)
    values (o1.id, p1, 'Antigo', 2, 100, current_date + 1, u1) returning id into old_pp;
  update patient_packages set expires_at = current_date - 1 where id = old_pp;
  assert (select status = 'expired' from patient_packages where id = old_pp), 'vencido ao atualizar';
  insert into patient_packages (organization_id, patient_id, name, sessions_total, price_cents, user_created)
    values (o1.id, p1, 'Novo', 2, 100, u1) returning id into pp2;
  update appointments set status = 'scheduled' where id = a[4];
  update appointments set status = 'completed', patient_package_id = null where id = a[4];
  assert (select patient_package_id = pp2 from appointments where id = a[4]), 'escolhe o ativo, não o vencido';

  -- Cancelado não volta e não é usado
  update patient_packages set status = 'cancelled' where id = pp2;
  ok := false; begin update patient_packages set status = 'active' where id = pp2;
  exception when others then ok := sqlerrm like '%não volta%'; end; assert ok, 'cancelado não volta';
  ok := false; begin update patient_packages set sessions_total = 10 where id = pp;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'sessões não mudam';

  -- expire_patient_packages
  update patient_packages set status = 'active' where id = old_pp; -- recalcula: continua vencido
  assert (select status = 'expired' from patient_packages where id = old_pp), 'continua vencido';
  assert expire_patient_packages(o1.id) = 0, 'nada mais a vencer';

  raise notice '0026_packages: todos os testes passaram';
end $$;

rollback;
