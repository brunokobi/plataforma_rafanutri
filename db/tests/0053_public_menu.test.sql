-- Testes da migração 0053 (cardápio público e pesquisa de satisfação). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; tok text; tok2 uuid; sv uuid; sheet uuid; ok boolean; dev text := encode(sha256('aparelho-1'), 'hex'); r satisfaction_responses;
begin
  insert into directus_users (id, email) values (owner, 'pm-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Pública', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;

  tok := unit_public_menu_set(ua, true);
  assert tok ~ '^[A-Za-z0-9_-]{32}$', format('token gerado: %s', tok);
  assert unit_public_menu_set(ua, true) = tok, 'religar mantém o token';
  assert unit_public_menu_set(ua, true, true) <> tok, 'trocar gera outro';
  perform unit_public_menu_set(ua, false);
  assert not (select public_menu_enabled from production_units where id = ua), 'desligado';

  insert into satisfaction_surveys (unit_id, questions) values (ua, '[{"text": "Gostou do prato?", "kind": "stars"}, {"text": "Comeria de novo?", "kind": "yes_no"}]') returning id into sv;
  assert (select organization_id from satisfaction_surveys where id = sv) = o1.id, 'empresa da unidade';
  ok := false; begin insert into satisfaction_surveys (unit_id, questions) values (ua, '[{"text": "Outra?", "kind": "stars"}]');
  exception when unique_violation then ok := true; end; assert ok, 'uma pesquisa ativa por unidade';
  ok := false; begin insert into satisfaction_surveys (unit_id, questions, active) values (ua, '[{"text": "x", "kind": "texto"}]', false);
  exception when raise_exception then ok := true; end; assert ok, 'pergunta inválida';
  ok := false; begin insert into satisfaction_surveys (unit_id, questions, active) values (ua, '[]', false);
  exception when check_violation then ok := true; end; assert ok, 'de 1 a 3 perguntas';

  insert into tech_sheets (organization_id, name, servings) values (o1.id, 'Feijoada', 10) returning id into sheet;
  insert into satisfaction_responses (survey_id, unit_id, organization_id, served_on, sheet_root_id, device_hash, answers, rating)
  values (sv, gen_random_uuid(), gen_random_uuid(), current_date, sheet, dev, '[4, true]', 1) returning * into r;
  assert r.unit_id = ua and r.organization_id = o1.id and r.rating = 4, 'nota da resposta calculada';
  ok := false; begin insert into satisfaction_responses (survey_id, served_on, sheet_root_id, device_hash, answers) values (sv, current_date, sheet, dev, '[5, true]');
  exception when unique_violation then ok := true; end; assert ok, 'uma resposta por aparelho, dia e prato';
  insert into satisfaction_responses (survey_id, served_on, device_hash, answers) values (sv, current_date, dev, '[5, false]');
  ok := false; begin insert into satisfaction_responses (survey_id, served_on, device_hash, answers) values (sv, current_date - 1, dev, '[6, true]');
  exception when raise_exception then ok := true; end; assert ok, 'nota de 1 a 5';
  ok := false; begin insert into satisfaction_responses (survey_id, served_on, device_hash, answers) values (sv, current_date - 1, dev, '[5]');
  exception when raise_exception then ok := true; end; assert ok, 'todas as perguntas';
  ok := false; begin update satisfaction_responses set rating = 1 where id = r.id;
  exception when raise_exception then ok := true; end; assert ok, 'resposta não se altera';
  ok := false; begin update satisfaction_surveys set questions = '[{"text": "Mudou?", "kind": "stars"}]' where id = sv;
  exception when raise_exception then ok := true; end; assert ok, 'pesquisa com respostas não muda as perguntas';
  update satisfaction_surveys set active = false where id = sv;
  ok := false; begin insert into satisfaction_responses (survey_id, served_on, device_hash, answers) values (sv, current_date - 2, dev, '[5, true]');
  exception when raise_exception then ok := true; end; assert ok, 'pesquisa encerrada';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from satisfaction_responses where survey_id = sv), 'cascata';
end $$;

rollback;
