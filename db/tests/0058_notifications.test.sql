-- Testes da migração 0058 (avisos por e-mail e Telegram). Transação desfeita no fim.
begin;

do $$
declare
  u uuid := gen_random_uuid(); o1 uuid; o2 uuid; p1 uuid; p2 uuid; a1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u, 'nt-owner@example.com');
  o1 := (select id from create_organization(u, 'Consultório Avisos A', 'solo', null, '123', 'CRN-9'));
  insert into organizations (name, slug, type) values ('Consultório Avisos B', 'nt-avisos-b-' || substr(md5(random()::text), 1, 6), 'solo') returning id into o2;
  insert into patients (organization_id, full_name, email) values (o1, 'Paciente Avisos Um', 'p1@example.com') returning id into p1;
  insert into patients (organization_id, full_name) values (o2, 'Paciente Avisos Dois') returning id into p2;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1, p1, u, now() + interval '1 day', now() + interval '1 day 1 hour', u) returning id into a1;

  -- configurações: horas permitidas
  insert into notification_settings (organization_id) values (o1);
  ok := false; begin update notification_settings set reminder_hours = '{5}' where organization_id = o1;
  exception when check_violation then ok := true; end; assert ok, 'só horas da lista';
  ok := false; begin update notification_settings set reminder_hours = '{1,2,3,6}' where organization_id = o1;
  exception when check_violation then ok := true; end; assert ok, 'no máximo 3 lembretes';

  -- preferências: paciente do próprio consultório; chat só pela extensão
  insert into patient_contact_prefs (patient_id, organization_id) values (p1, o1);
  ok := false; begin insert into patient_contact_prefs (patient_id, organization_id) values (p2, o1);
  exception when raise_exception then ok := true; end; assert ok, 'paciente de outro consultório';
  ok := false; begin update patient_contact_prefs set telegram_chat_id = 42 where patient_id = p1;
  exception when raise_exception then ok := true; end; assert ok, 'chat só pelo bot';
  perform set_config('rafanutri.telegram_link', 'on', true);
  update patient_contact_prefs set telegram_chat_id = 42, telegram_linked_at = now() where patient_id = p1;
  perform set_config('rafanutri.telegram_link', '', true);
  update patient_contact_prefs set email_opt_in = false where patient_id = p1;   -- canal sim, sem variável
  assert (select telegram_chat_id from patient_contact_prefs where patient_id = p1) = 42, 'chat ligado';

  -- fila: deduplicação, consultório do paciente e da consulta, tipos
  insert into notification_outbox (organization_id, patient_id, appointment_id, kind, channel, recipient, subject, body, dedupe_key)
    values (o1, p1, a1, 'appointment_reminder', 'telegram', '42', 'Lembrete', 'Sua consulta é amanhã.', 'k1');
  ok := false; begin insert into notification_outbox (organization_id, patient_id, kind, channel, recipient, subject, body, dedupe_key)
    values (o1, p1, 'appointment_reminder', 'telegram', '42', 'Lembrete', 'De novo.', 'k1');
  exception when unique_violation then ok := true; end; assert ok, 'dedupe';
  ok := false; begin insert into notification_outbox (organization_id, patient_id, kind, channel, recipient, subject, body)
    values (o1, p2, 'test', 'email', 'x@example.com', 'T', 'T');
  exception when raise_exception then ok := true; end; assert ok, 'paciente de outro consultório na fila';
  ok := false; begin insert into notification_outbox (organization_id, appointment_id, kind, channel, recipient, subject, body)
    values (o2, a1, 'test', 'email', 'x@example.com', 'T', 'T');
  exception when raise_exception then ok := true; end; assert ok, 'consulta de outro consultório na fila';
  ok := false; begin insert into notification_outbox (organization_id, kind, channel, recipient, subject, body)
    values (o1, 'whatsapp', 'email', 'x@example.com', 'T', 'T');
  exception when check_violation then ok := true; end; assert ok, 'tipo válido';
  ok := false; begin insert into notification_outbox (organization_id, kind, channel, recipient, subject, body, link)
    values (o1, 'test', 'email', 'x@example.com', 'T', 'T', 'http://inseguro.example.com');
  exception when check_violation then ok := true; end; assert ok, 'link só https';

  -- cascata: apagar a consulta leva os avisos dela; apagar o consultório leva tudo
  delete from appointments where id = a1;
  assert not exists (select 1 from notification_outbox where dedupe_key = 'k1'), 'some com a consulta';
  delete from organizations where id = o1;
  assert not exists (select 1 from patient_contact_prefs where patient_id = p1), 'preferências somem com o consultório';
  assert not exists (select 1 from notification_settings where organization_id = o1), 'configuração some com o consultório';
end $$;

rollback;
