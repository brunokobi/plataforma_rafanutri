-- Testes da migração 0048 (documentos de BPF e treinamentos). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  rt uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; doc uuid; v1 uuid; v2 uuid; tr uuid; ok boolean; v quality_document_versions;
begin
  insert into directus_users (id, email) values (owner, 'qd-owner@example.com'), (rt, 'qd-rt@example.com'), (cook, 'qd-cook@example.com');
  o1 := create_organization(owner, 'Cozinha Documentos', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into unit_members (unit_id, user_id, role) values (ua, rt, 'technical_lead'), (ua, cook, 'cook');

  insert into quality_documents (unit_id, kind, code, title) values (ua, 'pop', 'pop-higienizacao', 'POP 1 — Higienização') returning id into doc;
  assert (select organization_id from quality_documents where id = doc) = o1.id, 'organização da unidade';
  insert into quality_document_versions (document_id, version, body_md, status) values (doc, 1, '# POP 1', 'approved') returning id into v1;
  assert (select status from quality_document_versions where id = v1) = 'draft', 'nasce rascunho';
  ok := false; begin insert into quality_document_versions (document_id, version, body_md) values (doc, 2, 'x');
  exception when unique_violation then ok := true; end; assert ok, 'um rascunho por documento';
  ok := false; begin update quality_document_versions set status = 'approved' where id = v1;
  exception when raise_exception then ok := true; end; assert ok, 'aprovar só pela função';
  ok := false; begin perform doc_version_approve(v1, cook);
  exception when raise_exception then ok := sqlerrm like 'Só o RT%'; end; assert ok, 'cozinheiro não aprova';
  v := doc_version_approve(v1, rt);
  assert v.status = 'approved' and v.content_hash = encode(sha256(convert_to('# POP 1', 'UTF8')), 'hex') and v.next_review_on = (current_date + interval '12 months')::date, 'aprovada com hash e revisão';
  ok := false; begin update quality_document_versions set body_md = 'alterado' where id = v1;
  exception when raise_exception then ok := true; end; assert ok, 'aprovada imutável';
  ok := false; begin delete from quality_document_versions where id = v1;
  exception when raise_exception then ok := true; end; assert ok, 'aprovada não se apaga';

  insert into quality_document_versions (document_id, version, body_md, change_summary) values (doc, 2, '# POP 1 v2', 'Inclui o freezer novo') returning id into v2;
  perform doc_version_approve(v2, owner);
  assert (select version from quality_document_current where document_id = doc) = 2, 'vigente é a v2';

  -- ciência
  insert into document_acknowledgements (version_id, user_id) values (v2, cook);
  assert exists (select 1 from document_acknowledgements where version_id = v2 and user_id = cook), 'ciência registrada';

  -- treinamentos
  insert into trainings (unit_id, topic, held_on, hours, instructor) values (ua, 'Boas Práticas de Manipulação', current_date - 400, 4, 'RT') returning id into tr;
  insert into training_attendees (training_id, user_id) values (tr, cook);
  insert into training_attendees (training_id, name) values (tr, 'Visitante sem conta');
  ok := false; begin insert into training_attendees (training_id) values (tr);
  exception when check_violation then ok := true; end; assert ok, 'participante precisa de conta ou nome';
  ok := false; begin insert into trainings (unit_id, topic, held_on, hours) values (ua, 'X', current_date, 0);
  exception when check_violation then ok := true; end; assert ok, 'carga horária';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from quality_documents where organization_id = o1.id), 'cascata';
end $$;

rollback;
