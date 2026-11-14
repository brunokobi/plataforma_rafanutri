-- Testes da migração 0023 (documentos clínicos e modelos). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0023_clinical_documents.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; pa uuid; d1 uuid; d2 uuid; t1 uuid; ok boolean; pub timestamptz;
begin
  insert into directus_users (id, email) values (u1, 'doc-a@example.com'), (u2, 'doc-b@example.com');
  o1 := create_organization(u1, 'Consultório Doc A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Doc B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;
  insert into patients (organization_id, responsible_user_id, full_name, status) values (o1.id, u1, 'Arquivado', 'archived') returning id into pa;

  -- Criação: pedido de exames só com exames; nasce rascunho sem publicação
  insert into clinical_documents (organization_id, patient_id, kind, title, exams, user_created, published_at)
    values (o1.id, p1, 'exam_request', '  Pedido de exames  ', '["Hemograma completo", "Ferritina"]', u1, now()) returning id into d1;
  assert (select status = 'draft' and published_at is null and title = 'Pedido de exames' from clinical_documents where id = d1), 'rascunho, sem publicação, título aparado';
  insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created, status)
    values (o1.id, p1, 'supplement_prescription', 'Suplementos', 'Vitamina D 2.000 UI, 1 cápsula ao dia.', u1, 'published') returning id into d2;
  assert (select published_at is not null from clinical_documents where id = d2), 'publicado grava a data';

  -- Conteúdo obrigatório por tipo
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, user_created) values (o1.id, p1, 'exam_request', 'Vazio', u1);
  exception when check_violation then ok := true; end; assert ok, 'pedido sem exames nem texto';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created) values (o1.id, p1, 'general_guidance', 'Sem texto', ' ', u1);
  exception when check_violation then ok := true; end; assert ok, 'orientação sem texto';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, exams, user_created) values (o1.id, p1, 'general_guidance', 'Com exame', 'Texto.', '["Ferritina"]', u1);
  exception when check_violation then ok := true; end; assert ok, 'exames só no pedido';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, exams, user_created) values (o1.id, p1, 'exam_request', 'Exame inválido', '[1]', u1);
  exception when check_violation then ok := true; end; assert ok, 'exame precisa ser texto';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created) values (o1.id, p1, 'receipt', 'Tipo errado', 'Texto.', u1);
  exception when check_violation then ok := true; end; assert ok, 'tipo desconhecido';

  -- Quem cria e para quem
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created) values (o1.id, p2, 'general_guidance', 'Outro', 'Texto.', u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente de outro consultório';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created) values (o1.id, pa, 'general_guidance', 'Arquivado', 'Texto.', u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente arquivado';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body, user_created) values (o1.id, p1, 'general_guidance', 'Intruso', 'Texto.', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório';
  ok := false; begin insert into clinical_documents (organization_id, patient_id, kind, title, body) values (o1.id, p1, 'general_guidance', 'Sem autor', 'Texto.');
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'sem autor';

  -- Publicar, editar publicado (mantém a data), despublicar
  update clinical_documents set status = 'published' where id = d1;
  select published_at into pub from clinical_documents where id = d1;
  assert pub is not null, 'publicar grava a data';
  update clinical_documents set title = 'Pedido de exames de rotina', published_at = now() + interval '1 day' where id = d1;
  assert (select published_at = pub and date_updated is not null from clinical_documents where id = d1), 'edição mantém a data de publicação';
  update clinical_documents set status = 'draft' where id = d1;
  assert (select published_at is null from clinical_documents where id = d1), 'rascunho apaga a publicação';

  -- Imutáveis
  ok := false; begin update clinical_documents set patient_id = p2 where id = d2;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'não muda de paciente';
  ok := false; begin update clinical_documents set kind = 'general_guidance' where id = d2;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'não muda de tipo';
  ok := false; begin update clinical_documents set user_created = u2 where id = d2;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'não muda de autor';

  -- Modelos
  insert into clinical_document_templates (organization_id, kind, title, exams, user_created)
    values (o1.id, 'exam_request', 'Rotina anual', '["Hemograma completo", "Glicemia de jejum"]', u1) returning id into t1;
  ok := false; begin insert into clinical_document_templates (organization_id, kind, title, body, user_created) values (o1.id, 'general_guidance', 'Intruso', 'Texto.', u2);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'modelo de outro consultório';
  ok := false; begin insert into clinical_document_templates (organization_id, kind, title, user_created) values (o1.id, 'general_guidance', 'Vazio', u1);
  exception when check_violation then ok := true; end; assert ok, 'modelo vazio';
  ok := false; begin update clinical_document_templates set organization_id = o2.id where id = t1;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'modelo não muda de consultório';

  -- Paciente apagado leva os documentos
  delete from patients where id = p1;
  assert not exists (select 1 from clinical_documents where id in (d1, d2)), 'cascata do paciente';

  raise notice '0023_clinical_documents: todos os testes passaram';
end $$;

rollback;
