-- Testes da 0071 (mensagens entre paciente e nutricionista). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0071_patient_messages.test.sql
begin;
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); pu uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  o1 organizations; o2 organizations; p1 uuid; m1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'msg-a@example.com'), (u2, 'msg-b@example.com'), (pu, 'msg-paciente@example.com'), (outsider, 'msg-outro@example.com');
  o1 := create_organization(u1, 'Consultório Mensagens A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Mensagens B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Conversa') returning id into p1;
  perform set_config('rafanutri.patient_link', 'on', true);
  update patients set app_user_id = pu, app_activated_at = now() where id = p1;
  perform set_config('rafanutri.patient_link', '', true);

  if not (select patient_messages from organizations where id = o1.id) then raise exception 'FALHOU: mensagens ligadas por padrão'; end if;

  insert into patient_messages (organization_id, patient_id, sender, author_id, body) values (o1.id, p1, 'patient', pu, 'Oi, posso trocar o arroz?') returning id into m1;
  insert into patient_messages (organization_id, patient_id, sender, author_id, body, read_at) values (o1.id, p1, 'professional', u1, 'Pode, pela batata.', now());
  if (select read_at from patient_messages where sender = 'professional' and patient_id = p1) is not null then raise exception 'FALHOU: nasce sem leitura'; end if;

  ok := false; begin insert into patient_messages (organization_id, patient_id, sender, author_id, body) values (o1.id, p1, 'patient', outsider, 'forjada');
  exception when sqlstate 'P0001' then ok := true; end; assert ok, 'outra conta não envia como paciente';
  ok := false; begin insert into patient_messages (organization_id, patient_id, sender, author_id, body) values (o1.id, p1, 'professional', u2, 'de outro consultório');
  exception when sqlstate 'P0001' then ok := true; end; assert ok, 'nutricionista de outro consultório não responde';
  ok := false; begin insert into patient_messages (organization_id, patient_id, sender, author_id, body) values (o2.id, p1, 'professional', u2, 'paciente alheio');
  exception when sqlstate 'P0001' then ok := true; end; assert ok, 'paciente de outro consultório';
  ok := false; begin insert into patient_messages (organization_id, patient_id, sender, author_id, body) values (o1.id, p1, 'patient', pu, '   ');
  exception when check_violation then ok := true; end; assert ok, 'mensagem vazia';

  update patient_messages set read_at = now() where id = m1;  -- marcar como lida pode
  ok := false; begin update patient_messages set body = 'editada' where id = m1;
  exception when sqlstate 'P0001' then ok := true; end; assert ok, 'texto não muda depois de enviado';

  insert into notification_outbox (organization_id, patient_id, kind, channel, recipient, subject, body) values (o1.id, p1, 'message_to_patient', 'email', 'x@example.com', 'Nova mensagem', 'Abra o app');

  delete from patients where id = p1;
  if exists (select 1 from patient_messages where patient_id = p1) then raise exception 'FALHOU: cascata ao apagar paciente'; end if;
  raise notice '0071 ok';
end $$;
rollback;
