-- Testes da migração 0021 (o que o paciente vê). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0021_patient_share_settings.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  o1 organizations;
  p1 uuid; p2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'share-a@example.com');
  o1 := create_organization(u1, 'Consultório Share', 'solo', null, '1', 'CRN-1');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Dois') returning id into p2;
  insert into anthropometric_assessments (organization_id, patient_id, weight_kg, assessed_at, calc_version, user_created)
    values (o1.id, p1, 80, current_date - 30, '0.1.0', u1), (o1.id, p1, 78.5, current_date, '0.1.0', u1), (o1.id, p1, null, current_date - 10, '0.1.0', u1);

  -- Padrão: tudo desligado; histórico de peso não devolve nenhuma linha
  assert patient_share(p1) = '{"show_kcal": false, "show_macros": false, "show_weight_history": false}'::jsonb, 'padrão desligado';
  assert (select count(*) = 0 from patient_weight_history(p1)), 'sem liberação, nenhuma linha';

  -- Liberado por paciente: só data e peso, sem avaliações sem peso, em ordem
  update patients set share_settings = '{"show_weight_history": true}' where id = p1;
  assert (select count(*) = 2 from patient_weight_history(p1)), 'duas pesagens';
  assert (select array_agg(weight_kg order by assessed_at) = array[80, 78.5]::numeric[] from patient_weight_history(p1)), 'ordem por data';
  assert (select count(*) = 0 from patient_weight_history(p2)), 'outro paciente segue o padrão';

  -- Padrão do consultório vale para quem não escolheu; escolha do paciente vence
  update organizations set patient_share_defaults = '{"show_kcal": true, "show_macros": false, "show_weight_history": false}' where id = o1.id;
  assert (patient_share(p2) ->> 'show_kcal')::boolean, 'padrão do consultório';
  update patients set share_settings = '{"show_kcal": false}' where id = p2;
  assert not (patient_share(p2) ->> 'show_kcal')::boolean, 'escolha do paciente vence';
  update patients set share_settings = null where id = p2;
  assert (patient_share(p2) ->> 'show_kcal')::boolean, 'nulo volta ao padrão';

  -- Só as três chaves booleanas
  ok := false; begin update patients set share_settings = '{"show_everything": true}' where id = p1;
  exception when check_violation then ok := true; end; assert ok, 'chave desconhecida';
  ok := false; begin update patients set share_settings = '{"show_kcal": "sim"}' where id = p1;
  exception when check_violation then ok := true; end; assert ok, 'valor não booleano';
  ok := false; begin update organizations set patient_share_defaults = '[]' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'padrão precisa ser objeto';

  raise notice '0021_patient_share_settings: todos os testes passaram';
end $$;

rollback;
