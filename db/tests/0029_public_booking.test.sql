-- Testes da migração 0029 (página pública e agendamento online). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0029_public_booking.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; r1 uuid; s timestamptz := date_trunc('hour', now()) + interval '3 days'; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'pub-a@example.com'), (u2, 'pub-b@example.com');
  o1 := create_organization(u1, 'Consultório Público', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Público B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;

  -- Página: nutricionista precisa ser do consultório; expediente coerente
  ok := false; begin insert into public_profiles (organization_id, nutritionist_id) values (o1.id, u2);
  exception when others then ok := sqlerrm like '%precisa ser do consultório%'; end; assert ok, 'nutricionista de fora';
  ok := false; begin insert into public_profiles (organization_id, day_start, day_end) values (o1.id, '18:00', '08:00');
  exception when check_violation then ok := true; end; assert ok, 'expediente invertido';
  insert into public_profiles (organization_id, nutritionist_id) values (o1.id, u1);

  -- Desligado: não aceita pedido
  ok := false; begin insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at)
    values (o1.id, u1, 'Maria Online', 'maria@example.com', '+5531999990000', 'online', s, s + interval '1 hour');
  exception when others then ok := sqlerrm like '%desligado%'; end; assert ok, 'agendamento desligado';
  update public_profiles set enabled = true, booking_enabled = true where organization_id = o1.id;

  -- Pedido segura o horário: segundo pedido no mesmo horário é recusado; horário encostado passa
  insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at, status)
    values (o1.id, u1, ' Maria Online ', 'Maria@Example.com', '+5531999990000', 'online', s, s + interval '1 hour', 'confirmed') returning id into r1;
  assert (select status = 'pending' and full_name = 'Maria Online' and email = 'maria@example.com' from booking_requests where id = r1), 'nasce pendente, normalizado';
  ok := false; begin insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at)
    values (o1.id, u1, 'João Online', 'joao@example.com', '+5531988880000', 'online', s + interval '30 minutes', s + interval '90 minutes');
  exception when others then ok := sqlerrm like '%indisponível%'; end; assert ok, 'mesmo horário recusado';
  insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at)
    values (o1.id, u1, 'João Online', 'joao@example.com', '+5531988880000', 'online', s + interval '1 hour', s + interval '2 hours');

  -- Consulta existente também ocupa
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p1, u1, s + interval '1 day', s + interval '1 day 1 hour', u1);
  ok := false; begin insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at)
    values (o1.id, u1, 'Ana Online', 'ana@example.com', '+5531977770000', 'online', s + interval '1 day', s + interval '1 day 1 hour');
  exception when others then ok := sqlerrm like '%indisponível%'; end; assert ok, 'consulta ocupa';
  ok := false; begin insert into booking_requests (organization_id, nutritionist_id, full_name, email, phone, mode, starts_at, ends_at)
    values (o1.id, u1, 'Ana Online', 'ana@example.com', '+5531977770000', 'online', now() - interval '1 hour', now());
  exception when others then ok := sqlerrm like '%já passou%'; end; assert ok, 'passado';

  -- Recusado libera o horário; decidido não muda
  update booking_requests set status = 'declined', decided_at = now() where id = r1;
  assert not booking_slot_taken(o1.id, u1, s, s + interval '1 hour'), 'recusado libera';
  ok := false; begin update booking_requests set status = 'confirmed' where id = r1;
  exception when others then ok := sqlerrm like '%já decidido%'; end; assert ok, 'decidido não muda';
  ok := false; begin update booking_requests set starts_at = s + interval '5 hours' where id = r1;
  exception when others then ok := sqlerrm like '%não muda de horário%'; end; assert ok, 'horário fixo';

  -- Origem da consulta
  ok := false; begin update appointments set origin = 'site' where patient_id = p1;
  exception when check_violation then ok := true; end; assert ok, 'origem válida';

  raise notice '0029_public_booking: todos os testes passaram';
end $$;

rollback;
