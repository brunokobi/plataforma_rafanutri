-- Testes da migração 0007 (agenda). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0007_appointments.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; pb uuid; a1 uuid; a2 uuid; ok boolean;
  t0 timestamptz := date_trunc('day', now()) + interval '1 day 9 hours';
begin
  insert into directus_users (id, email) values (u1, 'ag-a@example.com'), (u2, 'ag-b@example.com');
  o1 := create_organization(u1, 'Consultório Agenda A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Agenda B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente Dois') returning id into p2;
  insert into patients (organization_id, full_name) values (o2.id, 'Paciente de B') returning id into pb;

  -- sem nutricionista informado, quem marca atende
  insert into appointments (organization_id, patient_id, starts_at, ends_at, type, user_created)
    values (o1.id, p1, t0, t0 + interval '1 hour', 'first', u1) returning id into a1;
  assert (select nutritionist_id from appointments where id = a1) = u1, 'nutricionista deveria ser quem marcou';

  -- sobreposição com o mesmo nutricionista é recusada
  ok := false;
  begin
    insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
      values (o1.id, p2, u1, t0 + interval '30 minutes', t0 + interval '90 minutes', u1);
  exception when exclusion_violation then ok := true;
  end;
  assert ok, 'consulta sobreposta deveria falhar';

  -- encostada (termina quando a outra começa) é permitida
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p2, u1, t0 + interval '1 hour', t0 + interval '105 minutes', u1) returning id into a2;

  -- cancelar libera o horário
  update appointments set status = 'cancelled' where id = a1;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p2, u1, t0, t0 + interval '45 minutes', u1);

  -- cancelada não pode ser remarcada
  ok := false;
  begin
    update appointments set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = a1;
  exception when others then ok := sqlerrm like '%não pode ser remarcada%';
  end;
  assert ok, 'remarcar cancelada deveria falhar';

  -- paciente de outro consultório
  ok := false;
  begin
    insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
      values (o1.id, pb, u1, t0 + interval '5 hours', t0 + interval '6 hours', u1);
  exception when others then ok := sqlerrm like '%não pertence a este consultório%';
  end;
  assert ok, 'paciente de outro consultório deveria falhar';

  -- nutricionista de outro consultório
  ok := false;
  begin
    insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
      values (o1.id, p1, u2, t0 + interval '5 hours', t0 + interval '6 hours', u1);
  exception when others then ok := sqlerrm like '%precisa ser do consultório%';
  end;
  assert ok, 'nutricionista de fora deveria falhar';

  -- autor de fora do consultório
  ok := false;
  begin
    insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
      values (o1.id, p1, u1, t0 + interval '5 hours', t0 + interval '6 hours', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%';
  end;
  assert ok, 'autor de fora deveria falhar';

  -- não muda de paciente; remarcar agendada funciona e registra date_updated
  ok := false;
  begin update appointments set patient_id = p1 where id = a2;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end;
  assert ok, 'trocar o paciente deveria falhar';
  update appointments set starts_at = t0 + interval '1 day', ends_at = t0 + interval '1 day 45 minutes' where id = a2;
  assert (select date_updated is not null from appointments where id = a2), 'date_updated deveria ser preenchido';

  -- formatos
  ok := false;
  begin insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p1, u1, t0 + interval '9 hours', t0 + interval '8 hours', u1);
  exception when check_violation then ok := true; end;
  assert ok, 'fim antes do início deveria falhar';
  ok := false;
  begin insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, mode, meeting_url, user_created)
    values (o1.id, p1, u1, t0 + interval '9 hours', t0 + interval '10 hours', 'online', 'javascript:alert(1)', u1);
  exception when check_violation then ok := true; end;
  assert ok, 'link que não é http(s) deveria falhar';

  -- apagar o paciente leva as consultas junto
  delete from patients where id = p2;
  assert not exists (select 1 from appointments where patient_id = p2), 'consultas do paciente apagado deveriam sumir';

  raise notice '0007_appointments: todos os testes passaram';
end $$;

rollback;
