-- Testes da 0066 (triagens nutricionais e módulos por contrato). Roda numa transação desfeita.
begin;
do $$
declare org uuid; org2 uuid; u uuid := gen_random_uuid(); stranger uuid := gen_random_uuid(); pat uuid := gen_random_uuid(); s uuid;
begin
  insert into directus_users (id, email) values (u, 'ph-owner@example.com'), (stranger, 'ph-x@example.com');
  org := (select id from create_organization(u, 'Consultório Saúde Pública', 'solo', null, '123', 'CRN-9'));
  insert into organizations (name, slug, type) values ('Outro SP', 'sp-b-' || substr(md5(random()::text), 1, 6), 'solo') returning id into org2;
  insert into patients (id, organization_id, full_name) values (pat, org, 'Paciente Triagem');

  update organizations set modules = '{clinical,uan,maternal,public_health,ai,practice,patient_area}' where id = org;
  begin
    update organizations set modules = '{clinical,teleport}' where id = org;
    raise exception 'FALHOU: módulo desconhecido';
  exception when check_violation then null; end;

  insert into nutrition_screenings (organization_id, patient_id, tool, tool_version, answers, score, classification, risk_level, screened_by)
    values (org, pat, 'must', 'must@bapen2011', '{"bmi": 19, "weightLossPct": 7}', 2, 'high', 'high', u) returning id into s;
  begin
    update nutrition_screenings set risk_level = 'low' where id = s;
    raise exception 'FALHOU: triagem alterada';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into nutrition_screenings (organization_id, patient_id, tool, tool_version, answers, classification, risk_level, screened_by)
      values (org2, pat, 'must', 'must@bapen2011', '{}', 'low', 'low', u);
    raise exception 'FALHOU: paciente de outro consultório';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into nutrition_screenings (organization_id, patient_id, tool, tool_version, answers, classification, risk_level, screened_by)
      values (org, pat, 'must', 'must@bapen2011', '{}', 'low', 'low', stranger);
    raise exception 'FALHOU: estranho registrou';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into nutrition_screenings (organization_id, patient_id, tool, tool_version, answers, classification, risk_level, screened_by)
      values (org, pat, 'xyz', 'x@y', '{}', 'low', 'low', u);
    raise exception 'FALHOU: ferramenta desconhecida';
  exception when check_violation then null; end;
  if not exists (select 1 from audit_logs where entity = 'nutrition_screenings' and entity_id = s::text) then raise exception 'FALHOU: auditoria'; end if;
  raise notice '0066 ok';
end $$;
rollback;
