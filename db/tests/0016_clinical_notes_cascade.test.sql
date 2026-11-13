-- Testes da migração 0016: a cascata leva as evoluções assinadas; o DELETE direto continua barrado.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0016_clinical_notes_cascade.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  o1 organizations; p1 uuid; p2 uuid; ap uuid; n1 uuid; n2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'cc-a@example.com');
  o1 := create_organization(u1, 'Consultório Cascata', 'solo', null, '1', 'CRN-1');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente 1') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente 2') returning id into p2;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p1, u1, now() + interval '1 day', now() + interval '1 day 1 hour', u1) returning id into ap;

  insert into clinical_notes (organization_id, patient_id, appointment_id, body, user_created) values (o1.id, p1, ap, 'Original', u1) returning id into n1;
  update clinical_notes set signed_at = now() where id = n1;
  insert into clinical_notes (organization_id, patient_id, body, user_created, supersedes_id) values (o1.id, p1, 'Retificação', u1, n1) returning id into n2;
  update clinical_notes set signed_at = now() where id = n2;

  ok := false; begin delete from clinical_notes where id = n2;
  exception when others then ok := sqlerrm like '%não pode ser apagada%'; end; assert ok, 'DELETE direto de assinada continua barrado';
  ok := false; begin update clinical_notes set appointment_id = null where id = n1;
  exception when others then ok := sqlerrm like '%não pode ser alterada%'; end; assert ok, 'UPDATE direto de assinada continua barrado';

  delete from appointments where id = ap;  -- consulta apagada: a evolução assinada fica, sem o vínculo
  assert (select appointment_id is null and body = 'Original' from clinical_notes where id = n1), 'evolução mantida sem a consulta';

  delete from patients where id = p1;      -- cascata leva original e retificação
  assert not exists (select 1 from clinical_notes where patient_id = p1), 'evoluções do paciente apagado deveriam sair';

  insert into clinical_notes (organization_id, patient_id, body, user_created) values (o1.id, p2, 'Outra', u1) returning id into n1;
  update clinical_notes set signed_at = now() where id = n1;
  delete from organizations where id = o1.id;
  assert not exists (select 1 from clinical_notes where organization_id = o1.id), 'evoluções do consultório apagado deveriam sair';

  raise notice '0016_clinical_notes_cascade: todos os testes passaram';
end $$;

rollback;
