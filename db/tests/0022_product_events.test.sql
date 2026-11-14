-- Testes da migração 0022 (eventos de produto e métricas). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0022_product_events.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  pu uuid := gen_random_uuid();
  o1 organizations;
  p1 uuid; r1 uuid; before bigint;
begin
  insert into directus_users (id, email) values (u1, 'ev-a@example.com'), (pu, 'ev-p@example.com');
  o1 := create_organization(u1, 'Consultório Eventos', 'solo', null, '1', 'CRN-1');
  select count(*) into before from product_events;

  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  assert (select count(*) = 1 from product_events where event = 'patient_created' and patient_id = p1 and organization_id = o1.id), 'paciente cadastrado';

  insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o1.id, p1, 'ev-p@example.com', repeat('e', 64), u1);
  assert (select count(*) = 1 from product_events where event = 'invite_sent' and patient_id = p1), 'convite enviado';

  perform set_config('rafanutri.patient_link', 'on', true);
  update patients set app_user_id = pu, app_activated_at = now() where id = p1;
  perform set_config('rafanutri.patient_link', '', true);
  assert (select count(*) = 1 from product_events where event = 'patient_activated' and patient_id = p1), 'acesso ativado';
  update patients set full_name = 'Paciente Um Editado' where id = p1;
  assert (select count(*) = 1 from product_events where event = 'patient_activated' and patient_id = p1), 'edição comum não gera evento';

  insert into plan_waitlist (organization_id, user_id, desired_plan, active_patients) values (o1.id, u1, 'professional', 1);
  update plan_waitlist set note = 'só nota' where organization_id = o1.id;
  update plan_waitlist set desired_plan = 'clinic' where organization_id = o1.id;
  assert (select count(*) = 2 from product_events where event = 'paid_interest' and organization_id = o1.id), 'interesse: criação e troca de plano';

  insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created, status)
    values (o1.id, p1, 'Sono', 'Durma bem', 'Oito horas.', u1, 'published') returning id into r1;
  perform set_config('rafanutri.patient_read', 'on', true);
  update patient_recommendations set read_at = now() where id = r1;
  perform set_config('rafanutri.patient_read', '', true);
  assert (select count(*) = 1 from product_events where event = 'recommendation_read' and organization_id = o1.id), 'recomendação lida';

  -- limite atingido (gravado pelo hook) entra no painel
  insert into product_events (event, organization_id, user_id) values ('limit_reached', o1.id, u1);
  assert (select organizacoes_no_limite >= 1 from metrics_limit_hits_monthly where mes = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date), 'nutricionistas no limite no mês';
  assert (select limit_hits_30d = 1 and active_patients = 1 and patients_with_access = 1 and wants_paid_plan from metrics_free_orgs where organization_id = o1.id), 'linha do consultório gratuito';
  assert (select pacientes_ativados >= 1 from metrics_activation), 'ativação';
  assert exists (select 1 from metrics_active_patients_distribution where faixa = '1 a 4'), 'distribuição';
  assert exists (select 1 from metrics_waitlist where desired_plan = 'clinic'), 'lista de interesse';
  assert (select count(*) - before = 7 from product_events), 'sete eventos';

  raise notice '0022_product_events: todos os testes passaram';
end $$;

rollback;
