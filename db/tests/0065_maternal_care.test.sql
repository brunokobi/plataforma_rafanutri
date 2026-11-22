-- Testes da 0065 (lactação, introdução alimentar, responsáveis e convite ao responsável). Roda numa transação desfeita.
begin;
do $$
declare org uuid; org2 uuid; u uuid := gen_random_uuid(); app uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  mom uuid := gen_random_uuid(); baby uuid := gen_random_uuid(); sib uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  l uuid; g uuid; g2 uuid; f uuid;
begin
  insert into directus_users (id, email) values (u, 'mc-owner@example.com'), (app, 'mc-guardian@example.com'), (stranger, 'mc-x@example.com');
  org := (select id from create_organization(u, 'Consultório Materno C', 'solo', null, '123', 'CRN-9'));
  insert into organizations (name, slug, type) values ('Consultório Materno D', 'mat-d-' || substr(md5(random()::text), 1, 6), 'solo') returning id into org2;
  insert into patients (id, organization_id, full_name, sex, birth_date) values
    (mom, org, 'Mãe Teste', 'female', '1992-03-01'), (baby, org, 'Bebê Teste', 'male', current_date - 210),
    (sib, org, 'Irmão Teste', 'female', current_date - 1500), (other, org2, 'Outro Consultório', 'female', current_date - 300);

  -- Lactação
  insert into lactations (organization_id, patient_id, baby_patient_id, started_on, feeding_type, user_created)
    values (org, mom, baby, current_date - 210, 'exclusive', u) returning id into l;
  begin
    insert into lactations (organization_id, patient_id, started_on, feeding_type, user_created) values (org, mom, current_date - 5, 'mixed', u);
    raise exception 'FALHOU: duas lactações ativas';
  exception when unique_violation then null; end;
  begin
    insert into lactations (organization_id, patient_id, baby_patient_id, started_on, feeding_type, user_created) values (org, sib, other, current_date - 5, 'mixed', u);
    raise exception 'FALHOU: bebê de outro consultório';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into lactations (organization_id, patient_id, started_on, feeding_type, user_created) values (org, baby, current_date - 5, 'mixed', u);
    raise exception 'FALHOU: lactação em paciente do sexo masculino';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into lactations (organization_id, patient_id, started_on, feeding_type, user_created) values (org, sib, current_date - 5, 'mixed', stranger);
    raise exception 'FALHOU: lactação por quem não é do consultório';
  exception when sqlstate 'P0001' then null; end;
  update lactations set status = 'ended', ended_on = current_date where id = l;

  -- Introdução alimentar: nutricionista, responsável pelo app e estranho
  insert into feeding_intro_progress (organization_id, patient_id, kind, item, introduced_on, recorded_by) values (org, baby, 'allergen', 'egg', current_date - 20, u) returning id into f;
  if (select by_guardian from feeding_intro_progress where id = f) then raise exception 'FALHOU: nutricionista marcado como responsável'; end if;
  begin
    insert into feeding_intro_progress (organization_id, patient_id, kind, item, introduced_on, recorded_by) values (org, baby, 'allergen', 'peanut', current_date - 2, stranger);
    raise exception 'FALHOU: estranho registrou';
  exception when sqlstate 'P0001' then null; end;
  begin
    insert into feeding_intro_progress (organization_id, patient_id, kind, item, introduced_on, reaction, recorded_by) values (org, baby, 'texture', 'mashed', current_date - 2, 'mild', u);
    raise exception 'FALHOU: reação em textura';
  exception when check_violation then null; end;
  begin
    insert into feeding_intro_progress (organization_id, patient_id, kind, item, introduced_on, recorded_by) values (org, baby, 'allergen', 'egg', current_date - 1, u);
    raise exception 'FALHOU: item repetido';
  exception when unique_violation then null; end;

  -- Responsável e consentimento
  insert into patient_guardians (organization_id, patient_id, full_name, relationship, email, user_created) values (org, baby, 'Mãe Teste', 'mother', 'MC-Guardian@Example.com ', u) returning id into g;
  if (select email from patient_guardians where id = g) <> 'mc-guardian@example.com' then raise exception 'FALHOU: e-mail normalizado'; end if;
  begin
    update patient_guardians set consent_at = now() where id = g;
    raise exception 'FALHOU: consentimento sem forma';
  exception when check_violation then null; end;
  begin
    insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created, guardian_id)
      values (org, baby, 'mc-guardian@example.com', repeat('a', 64), u, g);
    raise exception 'FALHOU: convite ao responsável sem consentimento';
  exception when sqlstate 'P0001' then null; end;
  update patient_guardians set consent_at = now(), consent_method = 'in_person', consent_recorded_by = u where id = g;
  insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created, guardian_id)
    values (org, baby, 'mc-guardian@example.com', repeat('b', 64), u, g);
  insert into patient_guardians (organization_id, patient_id, full_name, relationship, consent_at, consent_method, user_created)
    values (org, sib, 'Mãe Teste', 'mother', now(), 'signed_form', u) returning id into g2;
  begin
    insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created, guardian_id)
      values (org, baby, 'mc-guardian@example.com', repeat('c', 64), u, g2);
    raise exception 'FALHOU: responsável de outro paciente';
  exception when sqlstate 'P0001' then null; end;

  -- Mesma conta ligada a dois filhos do mesmo consultório; e o responsável registra pelo app
  perform set_config('rafanutri.patient_link', 'on', true);
  update patients set app_user_id = app, app_activated_at = now() where id in (baby, sib);
  perform set_config('rafanutri.patient_link', '', true);
  insert into feeding_intro_progress (organization_id, patient_id, kind, item, introduced_on, reaction, recorded_by) values (org, baby, 'allergen', 'peanut', current_date - 1, 'moderate', app) returning id into f;
  if not (select by_guardian from feeding_intro_progress where id = f) then raise exception 'FALHOU: registro do responsável'; end if;

  -- O que o paciente vê
  if (patient_share(baby) ->> 'show_maternal') <> 'false' then raise exception 'FALHOU: show_maternal começa desligado'; end if;
  update patients set share_settings = '{"show_maternal": true}' where id = baby;
  if (patient_share(baby) ->> 'show_maternal') <> 'true' then raise exception 'FALHOU: show_maternal ligado'; end if;
  begin
    update patients set share_settings = '{"show_growth": true}' where id = baby;
    raise exception 'FALHOU: chave desconhecida';
  exception when check_violation then null; end;

  insert into notification_outbox (organization_id, kind, channel, recipient, subject, body) values (org, 'feeding_reaction', 'email', 'x@example.com', 's', 'b');

  if not exists (select 1 from audit_logs where entity = 'patient_guardians' and entity_id = g::text) then raise exception 'FALHOU: auditoria do responsável'; end if;
  if not exists (select 1 from audit_logs where entity = 'lactations' and entity_id = l::text) then raise exception 'FALHOU: auditoria da lactação'; end if;
  raise notice '0065 ok';
end $$;
rollback;
