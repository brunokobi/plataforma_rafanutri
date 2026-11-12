-- Testes da migração 0008 (questionários e anamneses). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0008_anamneses.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; pb uuid; tpl uuid; tpl_b uuid; a1 uuid; a2 uuid; ok boolean;
  h text := repeat('a', 64);
  sch jsonb := '{"version":1,"sections":[{"title":"S","questions":[{"id":"q","type":"text","label":"Q"}]}]}';
begin
  insert into directus_users (id, email) values (u1, 'an-a@example.com'), (u2, 'an-b@example.com');
  o1 := create_organization(u1, 'Consultório Anamnese A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Anamnese B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, full_name) values (o2.id, 'Paciente de B') returning id into pb;

  -- modelo do consultório: versão 1 e sobe quando o conteúdo muda
  insert into questionnaire_templates (organization_id, name, schema, user_created) values (o1.id, 'Meu modelo', sch, u1) returning id into tpl;
  assert (select version from questionnaire_templates where id = tpl) = 1, 'versão inicial 1';
  update questionnaire_templates set name = 'Meu modelo 2' where id = tpl;
  assert (select version from questionnaire_templates where id = tpl) = 1, 'renomear não muda a versão';
  insert into questionnaire_templates (organization_id, name, schema, user_created) values (o2.id, 'Modelo de B', sch, u2) returning id into tpl_b;

  -- usuário não cria modelo da biblioteca (sem consultório) (0011)
  ok := false;
  begin insert into questionnaire_templates (organization_id, name, schema, user_created) values (null, 'Biblioteca falsa', sch, u1);
  exception when others then ok := sqlerrm like '%só podem ser criados pela equipe%'; end;
  assert ok, 'usuário criando questionário sem consultório deveria falhar';

  -- autor de fora não cria modelo no consultório
  ok := false;
  begin insert into questionnaire_templates (organization_id, name, schema, user_created) values (o1.id, 'Intruso', sch, u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end;
  assert ok, 'autor de fora deveria falhar';

  -- envio: cópia do questionário, título do modelo, validade padrão de 7 dias
  insert into anamneses (organization_id, patient_id, template_id, public_token_hash, user_created, answers)
    values (o1.id, p1, tpl, h, u1, '{"q":"forjado"}') returning id into a1;
  assert (select schema_snapshot = sch and template_version = 1 and title = 'Meu modelo 2' and answers = '{}'::jsonb
          from anamneses where id = a1), 'envio deveria copiar o questionário e ignorar respostas';
  assert (select token_expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute' from anamneses where id = a1), 'validade padrão 7 dias';

  -- mudar o modelo depois do envio não altera a anamnese
  update questionnaire_templates set schema = jsonb_set(sch, '{sections,0,title}', '"Nova"') where id = tpl;
  assert (select version from questionnaire_templates where id = tpl) = 2, 'versão deveria subir para 2';
  assert (select schema_snapshot = sch from anamneses where id = a1), 'anamnese deveria manter o questionário original';

  -- validade máxima de 30 dias
  insert into anamneses (organization_id, patient_id, template_id, public_token_hash, token_expires_at, user_created)
    values (o1.id, p1, tpl, repeat('b', 64), now() + interval '1 year', u1) returning id into a2;
  assert (select token_expires_at <= now() + interval '30 days 1 minute' from anamneses where id = a2), 'validade limitada a 30 dias';

  -- modelo de outro consultório, paciente de outro consultório, sem link
  ok := false;
  begin insert into anamneses (organization_id, patient_id, template_id, public_token_hash, user_created) values (o1.id, p1, tpl_b, repeat('c', 64), u1);
  exception when others then ok := sqlerrm like '%indisponível%'; end;
  assert ok, 'modelo de outro consultório deveria falhar';
  ok := false;
  begin insert into anamneses (organization_id, patient_id, template_id, public_token_hash, user_created) values (o1.id, pb, tpl, repeat('d', 64), u1);
  exception when others then ok := sqlerrm like '%não pertence%'; end;
  assert ok, 'paciente de outro consultório deveria falhar';
  ok := false;
  begin insert into anamneses (organization_id, patient_id, template_id, user_created) values (o1.id, p1, tpl, u1);
  exception when others then ok := sqlerrm like '%precisa de link%'; end;
  assert ok, 'anamnese sem link deveria falhar';

  -- rascunho do paciente, resposta final apaga o hash; respondida não muda respostas
  update anamneses set answers = '{"q":"rascunho"}' where id = a1;
  update anamneses set answers = '{"q":"final"}', status = 'answered' where id = a1;
  assert (select public_token_hash is null and answered_at is not null from anamneses where id = a1), 'responder deveria invalidar o link';
  ok := false;
  begin update anamneses set answers = '{"q":"mudou"}' where id = a1;
  exception when others then ok := sqlerrm like '%não pode ter as respostas alteradas%'; end;
  assert ok, 'alterar respostas depois de respondida deveria falhar';

  -- transições: respondida → revisada; revisada não volta; cancelada apaga o link
  update anamneses set status = 'reviewed', reviewed_by = u1 where id = a1;
  assert (select reviewed_at is not null from anamneses where id = a1), 'revisão deveria marcar a data';
  ok := false;
  begin update anamneses set status = 'sent' where id = a1;
  exception when others then ok := sqlerrm like '%inválida%'; end;
  assert ok, 'voltar para enviada deveria falhar';
  update anamneses set status = 'cancelled' where id = a2;
  assert (select public_token_hash is null from anamneses where id = a2), 'cancelar deveria invalidar o link';

  -- não troca de questionário
  ok := false;
  begin update anamneses set schema_snapshot = '{}'::jsonb where id = a2;
  exception when others then ok := sqlerrm like '%não pode mudar%'; end;
  assert ok, 'trocar o questionário deveria falhar';

  raise notice '0008_anamneses: todos os testes passaram';
end $$;

rollback;
