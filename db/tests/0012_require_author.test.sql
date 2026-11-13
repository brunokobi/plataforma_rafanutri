-- Testes da migração 0012 (autor obrigatório). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0012_require_author.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  o1 organizations;
  p1 uuid; a1 uuid; ok boolean;
  t0 timestamptz := date_trunc('day', now()) + interval '2 days 9 hours';
  sch jsonb := '{"version":1,"sections":[{"title":"S","questions":[{"id":"q","type":"text","label":"Q"}]}]}';
begin
  insert into directus_users (id, email) values (u1, 'aut-a@example.com');
  o1 := create_organization(u1, 'Consultório Autor', 'solo', null, '1', 'CRN-1');
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente Autor') returning id into p1;
  insert into questionnaire_templates (organization_id, name, schema, user_created) values (o1.id, 'Modelo Q', sch, u1);

  -- sem autor: nada é criado
  ok := false; begin insert into anthropometric_assessments (organization_id, patient_id, weight_kg, calc_version) values (o1.id, p1, 70, '1');
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'avaliação sem autor deveria falhar';
  ok := false; begin insert into meal_plans (organization_id, patient_id) values (o1.id, p1);
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'plano sem autor deveria falhar';
  ok := false; begin insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at) values (o1.id, p1, u1, t0, t0 + interval '1 hour');
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'consulta sem autor deveria falhar';
  ok := false; begin insert into anamneses (organization_id, patient_id, template_id, public_token_hash) values (o1.id, p1, (select id from questionnaire_templates where name = 'Modelo Q' and organization_id = o1.id), repeat('a', 64));
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'anamnese sem autor deveria falhar';
  ok := false; begin insert into questionnaire_templates (organization_id, name, schema) values (o1.id, 'Sem autor', sch);
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'questionário do consultório sem autor deveria falhar';
  ok := false; begin insert into meal_plan_templates (organization_id, name) values (o1.id, 'Sem autor');
  exception when others then ok := sqlerrm like '%sem autor%'; end; assert ok, 'modelo de plano do consultório sem autor deveria falhar';

  -- seed da plataforma (sem consultório, sem autor) continua permitida
  insert into questionnaire_templates (organization_id, name, schema) values (null, 'Seed de teste', sch);

  -- com autor do consultório: funciona
  insert into meal_plans (organization_id, patient_id, user_created) values (o1.id, p1, u1);

  -- reviewed_by só junto com a revisão
  insert into anamneses (organization_id, patient_id, template_id, public_token_hash, user_created)
    values (o1.id, p1, (select id from questionnaire_templates where name = 'Modelo Q' and organization_id = o1.id), repeat('b', 64), u1) returning id into a1;
  ok := false; begin update anamneses set reviewed_by = u1 where id = a1;
  exception when others then ok := sqlerrm like '%Revisor só é registrado%'; end; assert ok, 'revisor fora da revisão deveria falhar';
  update anamneses set status = 'answered' where id = a1;
  update anamneses set status = 'reviewed', reviewed_by = u1 where id = a1;
  assert (select reviewed_by = u1 from anamneses where id = a1), 'revisor deveria ser gravado na revisão';

  raise notice '0012_require_author: todos os testes passaram';
end $$;

rollback;
