-- Testes da migração 0015 (evoluções do prontuário). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0015_clinical_notes.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; n1 uuid; n2 uuid; r1 uuid; ok boolean;
begin
  insert into directus_users (id, email, first_name, last_name) values (u1, 'ev-a@example.com', 'Ana', 'Souza'), (u2, 'ev-b@example.com', null, null);
  o1 := create_organization(u1, 'Consultório Evolução A', 'solo', null, '12345', 'CRN-9');
  o2 := create_organization(u2, 'Consultório Evolução B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente A') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente B') returning id into p2;

  -- Rascunho
  insert into clinical_notes (organization_id, patient_id, body, user_created, signed_at, signer_name)
    values (o1.id, p1, '  Paciente relata melhora.  ', u1, now(), 'Forjado') returning id into n1;
  assert (select body = 'Paciente relata melhora.' and signed_at is null and signer_name is null from clinical_notes where id = n1), 'nasce rascunho, aparado, sem assinatura forjada';

  ok := false; begin insert into clinical_notes (organization_id, patient_id, body, user_created) values (o1.id, p1, 'x', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin insert into clinical_notes (organization_id, patient_id, body) values (o1.id, p1, 'x');
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'sem autor deveria falhar';
  ok := false; begin insert into clinical_notes (organization_id, patient_id, body, user_created) values (o1.id, p2, 'x', u1);
  exception when others then ok := sqlerrm like '%não pertence%'; end; assert ok, 'paciente de outro consultório deveria falhar';

  update clinical_notes set body = 'Paciente relata melhora do intestino.' where id = n1;
  ok := false; begin update clinical_notes set patient_id = p2 where id = n1;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end; assert ok, 'mudar de paciente deveria falhar';
  ok := false; begin insert into clinical_notes (organization_id, patient_id, body, user_created, supersedes_id) values (o1.id, p1, 'x', u1, n1);
  exception when others then ok := sqlerrm like '%Só evoluções assinadas%'; end; assert ok, 'retificar rascunho deveria falhar';

  -- Assinar
  update clinical_notes set signed_at = '2000-01-01' where id = n1;
  assert (select signed_at > now() - interval '1 minute' and signer_name = 'Ana Souza' and signer_crn = 'CRN-9 12345' from clinical_notes where id = n1), 'assinatura com hora do servidor, nome e CRN';
  ok := false; begin update clinical_notes set body = 'Mudado' where id = n1;
  exception when others then ok := sqlerrm like '%assinada não pode ser alterada%'; end; assert ok, 'editar assinada deveria falhar';
  ok := false; begin update clinical_notes set signed_at = null where id = n1;
  exception when others then ok := sqlerrm like '%assinada não pode ser alterada%'; end; assert ok, 'desassinar deveria falhar';
  ok := false; begin delete from clinical_notes where id = n1;
  exception when others then ok := sqlerrm like '%não pode ser apagada%'; end; assert ok, 'apagar assinada deveria falhar';

  -- Retificar
  insert into clinical_notes (organization_id, patient_id, body, user_created, supersedes_id) values (o1.id, p1, 'Correção: melhora parcial.', u1, n1) returning id into r1;
  ok := false; begin insert into clinical_notes (organization_id, patient_id, body, user_created, supersedes_id) values (o1.id, p1, 'Outra', u1, n1);
  exception when unique_violation then ok := true; end; assert ok, 'segunda retificação da mesma versão deveria falhar';
  assert (select body = 'Paciente relata melhora do intestino.' from clinical_notes where id = n1), 'original preservada';

  -- Rascunho pode ser apagado
  insert into clinical_notes (organization_id, patient_id, body, user_created) values (o1.id, p1, 'Rascunho', u1) returning id into n2;
  delete from clinical_notes where id = n2;

  -- Autor sem nome: assina com o e-mail
  insert into clinical_notes (organization_id, patient_id, body, user_created) values (o2.id, p2, 'Nota B', u2) returning id into n2;
  update clinical_notes set signed_at = now() where id = n2;
  assert (select signer_name = 'ev-b@example.com' and signer_crn = 'CRN-2 2' from clinical_notes where id = n2), 'sem nome usa e-mail';

  raise notice '0015_clinical_notes: todos os testes passaram';
end $$;

rollback;
