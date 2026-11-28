-- Testes da 0072 (acompanhamento em casa). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0072_patient_tracking.test.sql
begin;
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations; p1 uuid; g1 uuid; ok boolean; s jsonb;
begin
  insert into directus_users (id, email) values (u1, 'trk-a@example.com'), (u2, 'trk-b@example.com');
  o1 := create_organization(u1, 'Consultório Casa A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Casa B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Casa') returning id into p1;

  s := patient_share(p1);
  if not ((s->>'show_body')::boolean and (s->>'self_weight')::boolean and (s->>'water')::boolean and (s->>'goals')::boolean and (s->>'meal_checks')::boolean) then raise exception 'FALHOU: padrões ligados'; end if;
  if (s->>'weight_neutral')::boolean or (s->>'show_weight_history')::boolean then raise exception 'FALHOU: padrões desligados'; end if;
  update patients set share_settings = '{"weight_neutral": true, "water": false}' where id = p1;
  if not (patient_share(p1)->>'weight_neutral')::boolean then raise exception 'FALHOU: escolha por paciente'; end if;
  ok := false; begin update patients set share_settings = '{"inventada": true}' where id = p1;
  exception when check_violation then ok := true; end; assert ok, 'chave desconhecida';

  insert into patient_weight_logs (organization_id, patient_id, weight_kg, measured_at) values (o1.id, p1, 72.4, now() - interval '1 hour');
  ok := false; begin insert into patient_weight_logs (organization_id, patient_id, weight_kg) values (o2.id, p1, 70);
  exception when sqlstate 'P0001' then ok := true; end; assert ok, 'peso em outro consultório';
  ok := false; begin insert into patient_weight_logs (organization_id, patient_id, weight_kg, measured_at) values (o1.id, p1, 70, now() + interval '1 day');
  exception when check_violation then ok := true; end; assert ok, 'pesagem no futuro';
  ok := false; begin insert into patient_weight_logs (organization_id, patient_id, weight_kg) values (o1.id, p1, 900);
  exception when check_violation then ok := true; end; assert ok, 'peso fora da faixa';

  insert into patient_water_logs (organization_id, patient_id, amount_ml) values (o1.id, p1, 250);
  ok := false; begin insert into patient_water_logs (organization_id, patient_id, amount_ml) values (o1.id, p1, 10);
  exception when check_violation then ok := true; end; assert ok, 'água pouca demais';

  insert into patient_habit_settings (patient_id, organization_id, water_goal_ml, water_reminders) values (p1, o1.id, 2500, true);
  ok := false; begin update patient_habit_settings set reminder_start = '21:00', reminder_end = '08:00' where patient_id = p1;
  exception when check_violation then ok := true; end; assert ok, 'janela invertida';
  ok := false; begin update patient_habit_settings set reminder_every_min = 15 where patient_id = p1;
  exception when check_violation then ok := true; end; assert ok, 'intervalo inválido';

  insert into patient_goals (organization_id, patient_id, title, frequency, times_per_week) values (o1.id, p1, 'Caminhar 30 min', 'weekly', 3) returning id into g1;
  ok := false; begin insert into patient_goals (organization_id, patient_id, title, kind) values (o1.id, p1, 'Peso', 'weight');
  exception when check_violation then ok := true; end; assert ok, 'meta de peso sem alvo';
  insert into patient_goal_checks (goal_id, day) values (g1, current_date);
  ok := false; begin insert into patient_goal_checks (goal_id, day) values (g1, current_date);
  exception when unique_violation then ok := true; end; assert ok, 'marcar duas vezes no dia';

  insert into notification_outbox (organization_id, patient_id, kind, channel, recipient, subject, body) values (o1.id, p1, 'water_reminder', 'telegram', '123', 'Água', 'Beba água');

  delete from patients where id = p1;
  if exists (select 1 from patient_weight_logs where patient_id = p1) or exists (select 1 from patient_goals where patient_id = p1) then raise exception 'FALHOU: cascata'; end if;
  raise notice '0072 ok';
end $$;
rollback;
