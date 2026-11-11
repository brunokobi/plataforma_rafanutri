-- Testes da migração 0005 (avaliações antropométricas). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0005_anthropometric_assessments.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; a uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'av-a@example.com'), (u2, 'av-b@example.com');
  o1 := create_organization(u1, 'Consultório A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, full_name, sex) values (o1.id, 'Paciente A', 'female') returning id into p1;
  insert into patients (organization_id, full_name, sex) values (o2.id, 'Paciente B', 'male') returning id into p2;

  -- avaliação válida
  insert into anthropometric_assessments (organization_id, patient_id, weight_kg, height_cm, protocol, skinfolds, results, calc_version, user_created)
    values (o1.id, p1, 67.6, 165, 'jp3', '{"triceps":20,"suprailiac":17,"thigh":27}', '{"bmi":24.8}', '0.1.0', u1)
    returning id into a;
  assert (select weight_kg from anthropometric_assessments where id = a) = 67.6, 'avaliação gravada';

  -- paciente de outro consultório
  ok := false;
  begin
    insert into anthropometric_assessments (organization_id, patient_id, calc_version, user_created) values (o1.id, p2, '0.1.0', u1);
  exception when others then ok := sqlerrm like '%não pertence a este consultório%';
  end;
  assert ok, 'paciente de outro consultório deveria falhar';

  -- autor que não é membro do consultório
  ok := false;
  begin
    insert into anthropometric_assessments (organization_id, patient_id, calc_version, user_created) values (o1.id, p1, '0.1.0', u2);
  exception when others then ok := sqlerrm like '%owner ou nutricionista%';
  end;
  assert ok, 'autor de outro consultório deveria falhar';

  -- não muda de paciente/consultório e marca date_updated
  ok := false;
  begin
    update anthropometric_assessments set patient_id = p2, organization_id = o2.id where id = a;
  exception when others then ok := sqlerrm like '%não pode mudar%';
  end;
  assert ok, 'trocar paciente deveria falhar';
  update anthropometric_assessments set notes = 'Ajuste' where id = a;
  assert (select date_updated is not null from anthropometric_assessments where id = a), 'date_updated preenchido';

  -- valores fora da faixa e protocolo desconhecido
  ok := false;
  begin insert into anthropometric_assessments (organization_id, patient_id, weight_kg, calc_version) values (o1.id, p1, 0, '0.1.0');
  exception when check_violation then ok := true; end;
  assert ok, 'peso zero deveria falhar';
  ok := false;
  begin insert into anthropometric_assessments (organization_id, patient_id, protocol, calc_version) values (o1.id, p1, 'inventado', '0.1.0');
  exception when check_violation then ok := true; end;
  assert ok, 'protocolo desconhecido deveria falhar';
  ok := false;
  begin insert into anthropometric_assessments (organization_id, patient_id, assessed_at, calc_version) values (o1.id, p1, current_date + 1, '0.1.0');
  exception when check_violation then ok := true; end;
  assert ok, 'data futura deveria falhar';

  -- apagar o paciente apaga as avaliações
  delete from patients where id = p1;
  assert not exists (select 1 from anthropometric_assessments where patient_id = p1), 'cascata ao apagar paciente';

  raise notice '0005_anthropometric_assessments: todos os testes passaram';
end $$;

rollback;
