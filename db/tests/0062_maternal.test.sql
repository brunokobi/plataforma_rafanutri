-- Testes da 0062 (gestação). Roda numa transação desfeita.
begin;
do $$
declare org uuid; org2 uuid; u uuid := gen_random_uuid(); pat uuid := gen_random_uuid(); man uuid := gen_random_uuid(); g uuid;
begin
  insert into directus_users (id, email) values (u, 'mat-owner@example.com');
  org := (select id from create_organization(u, 'Consultório Materno A', 'solo', null, '123', 'CRN-9'));
  insert into organizations (name, slug, type) values ('Consultório Materno B', 'mat-b-' || substr(md5(random()::text), 1, 6), 'solo') returning id into org2;
  insert into patients (id, organization_id, full_name, sex) values (pat, org, 'Gestante Teste', 'female'), (man, org, 'Homem Teste', 'male');

  insert into pregnancies (organization_id, patient_id, lmp_date, pre_pregnancy_weight_kg, height_cm, user_created)
    values (org, pat, current_date - 70, 62, 165, u) returning id into g;

  begin
    insert into pregnancies (organization_id, patient_id, lmp_date, pre_pregnancy_weight_kg, height_cm, user_created) values (org, pat, current_date - 10, 62, 165, u);
    raise exception 'FALHOU: duas gestações ativas';
  exception when unique_violation then null; end;

  begin
    insert into pregnancies (organization_id, patient_id, lmp_date, pre_pregnancy_weight_kg, height_cm, user_created) values (org, man, current_date - 10, 80, 175, u);
    raise exception 'FALHOU: gestação em paciente do sexo masculino';
  exception when sqlstate 'P0001' then null; end;

  begin
    insert into pregnancies (organization_id, patient_id, lmp_date, pre_pregnancy_weight_kg, height_cm, user_created) values (org2, pat, current_date - 10, 62, 165, u);
    raise exception 'FALHOU: gestação em outro consultório';
  exception when sqlstate 'P0001' then null; end;

  begin
    update pregnancies set status = 'ended' where id = g;
    raise exception 'FALHOU: encerrar sem data';
  exception when check_violation then null; end;

  update pregnancies set status = 'ended', ended_on = current_date, outcome = 'birth' where id = g;

  begin
    update pregnancies set organization_id = org2 where id = g;
    raise exception 'FALHOU: mudar de consultório';
  exception when sqlstate 'P0001' then null; end;

  if not exists (select 1 from audit_logs where entity = 'pregnancies' and entity_id = g::text) then
    raise exception 'FALHOU: auditoria da gestação';
  end if;
  raise notice '0062 ok';
end $$;
rollback;
