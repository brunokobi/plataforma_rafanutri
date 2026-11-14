-- Testes da migração 0020 (recomendações ao paciente). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0020_patient_recommendations.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; pa uuid; r1 uuid; r2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'rec-a@example.com'), (u2, 'rec-b@example.com');
  o1 := create_organization(u1, 'Consultório Rec A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Rec B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;
  insert into patients (organization_id, responsible_user_id, full_name, status) values (o1.id, u1, 'Arquivado', 'archived') returning id into pa;

  -- Criação
  insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created, read_at, published_at)
    values (o1.id, p1, 'Hidratação', 'Beba água', 'Dois litros por dia.', u1, now(), now()) returning id into r1;
  assert (select status = 'draft' and published_at is null and read_at is null from patient_recommendations where id = r1), 'rascunho sem publicação e sem leitura';
  insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created, status)
    values (o1.id, p1, 'Sono', 'Durma bem', 'Oito horas.', u1, 'published') returning id into r2;
  assert (select published_at is not null from patient_recommendations where id = r2), 'publicada grava a data';
  ok := false; begin insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created) values (o1.id, p2, 'Sono', 'X título', 'Texto.', u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente de outro consultório deveria falhar';
  ok := false; begin insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created) values (o1.id, pa, 'Sono', 'X título', 'Texto.', u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente arquivado deveria falhar';
  ok := false; begin insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created) values (o1.id, p1, 'Sono', 'X título', 'Texto.', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin insert into patient_recommendations (organization_id, patient_id, category, title, body, user_created) values (o1.id, p1, 'Sono', 'X', 'Texto.', u1);
  exception when check_violation then ok := true; end; assert ok, 'título curto deveria falhar';

  -- Profissional não marca leitura
  ok := false; begin update patient_recommendations set read_at = now() where id = r2;
  exception when others then ok := sqlerrm like '%só é marcada pelo paciente%'; end; assert ok, 'profissional não marca leitura';

  -- Paciente: só read_at, uma vez, em publicada
  perform set_config('rafanutri.patient_read', 'on', true);
  ok := false; begin update patient_recommendations set read_at = now() where id = r1;
  exception when others then ok := sqlerrm like '%Leitura inválida%'; end; assert ok, 'rascunho não é lido';
  ok := false; begin update patient_recommendations set read_at = now(), title = 'Mudado' where id = r2;
  exception when others then ok := sqlerrm like '%Leitura inválida%'; end; assert ok, 'leitura não muda o texto';
  ok := false; begin update patient_recommendations set pinned = true where id = r2;
  exception when others then ok := sqlerrm like '%só marca a leitura%'; end; assert ok, 'paciente não muda outros campos';
  update patient_recommendations set read_at = now() where id = r2;
  assert (select read_at is not null from patient_recommendations where id = r2), 'leitura marcada';
  ok := false; begin update patient_recommendations set read_at = clock_timestamp() where id = r2;
  exception when others then ok := sqlerrm like '%Leitura inválida%'; end; assert ok, 'leitura só uma vez';
  perform set_config('rafanutri.patient_read', '', true);

  -- Fixar não zera a leitura; editar o texto zera; voltar a rascunho zera e tira a data
  update patient_recommendations set pinned = true where id = r2;
  assert (select read_at is not null from patient_recommendations where id = r2), 'fixar mantém a leitura';
  update patient_recommendations set body = 'Oito horas por noite.' where id = r2;
  assert (select read_at is null from patient_recommendations where id = r2), 'editar o texto zera a leitura';
  update patient_recommendations set status = 'draft' where id = r2;
  assert (select published_at is null from patient_recommendations where id = r2), 'rascunho sem data de publicação';
  ok := false; begin update patient_recommendations set patient_id = pa where id = r2;
  exception when others then ok := sqlerrm like '%não muda de paciente%'; end; assert ok, 'não muda de paciente';

  delete from patients where id = p1;
  assert not exists (select 1 from patient_recommendations where patient_id = p1), 'cascata';

  raise notice '0020_patient_recommendations: todos os testes passaram';
end $$;

rollback;
