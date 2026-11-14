-- Testes da migração 0030 (auditoria). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0030_audit.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; a1 uuid; lid bigint; ok boolean; n int;
begin
  insert into directus_users (id, email) values (u1, 'aud-a@example.com'), (u2, 'aud-b@example.com');
  o1 := create_organization(u1, 'Consultório Auditoria', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Auditoria B', 'solo', null, '2', 'CRN-2');

  -- Inserção sem ator na sessão: paciente sem autor (vem do directus_activity), consulta pega user_created
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Auditado') returning id into p1;
  assert (select count(*) = 1 and bool_and(actor_id is null and patient_id = p1 and changed_fields is null)
            from audit_logs where entity = 'patients' and entity_id = p1::text and action = 'insert'), 'inserção do paciente';
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p1, u1, now() + interval '1 day', now() + interval '1 day 1 hour', u1) returning id into a1;
  assert (select actor_id = u1 and patient_id = p1 from audit_logs where entity = 'appointments' and entity_id = a1::text and action = 'insert'), 'autor pelo user_created';

  -- Alteração: só os nomes dos campos, sem valores; com ator da sessão
  perform set_config('rafanutri.actor', u1::text, true);
  update patients set full_name = 'Paciente Auditado Silva', objective = 'segredo clínico' where id = p1;
  assert exists (select 1 from audit_logs where entity = 'patients' and entity_id = p1::text and action = 'update'
                   and changed_fields = array['full_name', 'objective'] and actor_id = u1), 'campos alterados';
  -- a consulta marcada mudou a etapa do CRM do paciente (gatilho), também auditado
  assert exists (select 1 from audit_logs where entity = 'patients' and entity_id = p1::text and changed_fields = array['crm_stage']), 'mudança por gatilho';
  assert not exists (select 1 from audit_logs where array_to_string(changed_fields, ',') like '%segredo%'), 'sem valores';

  -- Repetição igual em 10 minutos não duplica; campo diferente entra
  update patients set full_name = 'Paciente Auditado S.' where id = p1;
  update patients set full_name = 'Paciente Auditado Souza' where id = p1;
  assert (select count(*) = 1 from audit_logs where entity = 'patients' and entity_id = p1::text and action = 'update' and changed_fields = array['full_name']), 'sem duplicar';
  -- Update sem mudança real não registra
  select count(*) into n from audit_logs where entity = 'patients' and entity_id = p1::text;
  update patients set full_name = full_name where id = p1;
  assert (select count(*) = n from audit_logs where entity = 'patients' and entity_id = p1::text), 'update vazio ignorado';

  -- Leitura do prontuário
  perform log_access(o1.id, u1, 'clinical_notes', p1::text, p1);
  perform log_access(o1.id, u1, 'clinical_notes', p1::text, p1);
  assert (select count(*) = 1 from audit_logs where action = 'read' and entity = 'clinical_notes'), 'leitura registrada uma vez';
  ok := false; begin perform log_access(o1.id, u1, 'clinical_notes', p1::text, p1, 'delete');
  exception when others then ok := sqlerrm like '%inválida%'; end; assert ok, 'ação de acesso inválida';

  -- Exclusão
  delete from appointments where id = a1;
  assert exists (select 1 from audit_logs where entity = 'appointments' and entity_id = a1::text and action = 'delete' and actor_id = u1), 'exclusão';

  -- Imutável
  select id into lid from audit_logs where organization_id = o1.id limit 1;
  ok := false; begin update audit_logs set action = 'read' where id = lid;
  exception when others then ok := sqlerrm like '%não pode ser alterado%'; end; assert ok, 'não altera';
  ok := false; begin delete from audit_logs where id = lid;
  exception when others then ok := sqlerrm like '%não pode ser alterado%'; end; assert ok, 'não apaga';

  -- Ator inválido na sessão é ignorado
  perform set_config('rafanutri.actor', 'xyz', true);
  update patients set phone = '+5531999990000' where id = p1;
  assert (select actor_id is null from audit_logs where entity = 'patients' and entity_id = p1::text and changed_fields = array['phone']), 'ator inválido';

  -- Membros
  assert exists (select 1 from audit_logs where entity = 'organization_members' and organization_id = o2.id and action = 'insert'), 'membro auditado';

  -- Consultório apagado leva o log junto
  select count(*) into n from audit_logs where organization_id = o2.id;
  assert n > 0, 'o2 tem log';
  delete from organizations where id = o2.id;
  assert not exists (select 1 from audit_logs where organization_id = o2.id), 'cascata';

  raise notice '0030_audit: todos os testes passaram';
end $$;

rollback;
