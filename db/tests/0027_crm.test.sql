-- Testes da migração 0027 (CRM). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0027_crm.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations;
  p1 uuid; p2 uuid; l1 uuid; a1 uuid; a2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'crm-a@example.com'), (u2, 'crm-b@example.com');
  o1 := create_organization(u1, 'Consultório CRM', 'solo', null, '1', 'CRN-1');
  perform create_organization(u2, 'Consultório CRM B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Dois') returning id into p2;

  -- Lead: cria com evento; perdido exige motivo (vai na nota do evento)
  insert into leads (organization_id, full_name, phone, source, user_created) values (o1.id, ' Maria Lead ', '+5531999990000', 'instagram', u1) returning id into l1;
  assert (select full_name = 'Maria Lead' and stage = 'new' from leads where id = l1), 'lead novo';
  assert (select count(*) = 1 from crm_events where lead_id = l1 and to_stage = 'new'), 'evento de criação';
  ok := false; begin update leads set stage = 'lost' where id = l1;
  exception when check_violation then ok := true; end; assert ok, 'perdido sem motivo';
  perform set_config('rafanutri.actor', u1::text, true);
  update leads set stage = 'lost', lost_reason = 'Achou caro' where id = l1;
  assert (select note = 'Achou caro' and from_stage = 'new' and user_id = u1 from crm_events where lead_id = l1 and to_stage = 'lost'), 'motivo na nota do evento';
  update leads set stage = 'contacted' where id = l1;
  assert (select lost_reason is null from leads where id = l1), 'motivo some ao sair de perdido';
  ok := false; begin insert into leads (organization_id, full_name, user_created) values (o1.id, 'Intruso', u2);
  exception when others then ok := sqlerrm like '%Só membros%'; end; assert ok, 'outro consultório não cadastra';
  ok := false; begin update leads set stage = 'converted' where id = l1;
  exception when others then ok := sqlerrm like '%precisa do paciente%'; end; assert ok, 'convertido exige paciente';
  update leads set stage = 'converted', patient_id = p2 where id = l1;
  ok := false; begin update leads set stage = 'new' where id = l1;
  exception when others then ok := sqlerrm like '%não volta%'; end; assert ok, 'convertido não volta';

  -- Paciente: agendar 1ª → scheduled; concluir 1ª → first_visit; concluir retorno → follow_up
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, type, user_created)
    values (o1.id, p1, u1, now() + interval '1 day', now() + interval '1 day 1 hour', 'first', u1) returning id into a1;
  assert (select crm_stage = 'scheduled' from patients where id = p1), 'agendado';
  update appointments set status = 'completed' where id = a1;
  assert (select crm_stage = 'first_visit' from patients where id = p1), '1ª consulta';
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, type, user_created)
    values (o1.id, p1, u1, now() + interval '2 days', now() + interval '2 days 1 hour', 'return', u1) returning id into a2;
  assert (select crm_stage = 'first_visit' from patients where id = p1), 'retorno agendado não muda';
  update appointments set status = 'completed' where id = a2;
  assert (select crm_stage = 'follow_up' from patients where id = p1), 'acompanhamento';
  assert (select array_agg(to_stage order by id) = array['scheduled', 'first_visit', 'follow_up'] from crm_events where patient_id = p1 and auto), 'eventos automáticos';

  -- 90 dias sem consulta → inactive com evento (p3: última consulta há 100 dias, nada marcado)
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Três') returning id into p2;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, type, status, user_created)
    values (o1.id, p2, u1, now() - interval '100 days', now() - interval '100 days' + interval '1 hour', 'first', 'completed', u1);
  assert (select crm_stage = 'first_visit' from patients where id = p2), '1ª no passado';
  assert crm_mark_inactive(o1.id) = 1, 'só o paciente sem consulta há 90 dias';
  assert (select crm_stage = 'inactive' from patients where id = p2), 'inativo';
  assert (select crm_stage = 'follow_up' from patients where id = p1), 'p1 continua (consultas recentes)';
  assert (select note = '90 dias sem consulta' and auto from crm_events where patient_id = p2 and to_stage = 'inactive'), 'evento de inativo';
  assert crm_mark_inactive(o1.id) = 0, 'idempotente';

  -- Nova consulta marcada tira do inativo
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, type, user_created)
    values (o1.id, p2, u1, now() + interval '3 days', now() + interval '3 days 1 hour', 'return', u1);
  assert (select crm_stage = 'first_visit' from patients where id = p2), 'volta do inativo';

  raise notice '0027_crm: todos os testes passaram';
end $$;

rollback;
