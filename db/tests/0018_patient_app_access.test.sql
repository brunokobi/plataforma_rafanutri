-- Testes da migração 0018 (acesso do paciente). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0018_patient_app_access.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  pu uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; pa uuid; i1 uuid; ok boolean;
  h text := repeat('a', 64);
begin
  insert into directus_users (id, email) values (u1, 'pa-a@example.com'), (u2, 'pa-b@example.com'), (pu, 'paciente@example.com');
  o1 := create_organization(u1, 'Consultório Acesso A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Acesso B', 'solo', null, '2', 'CRN-2');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;
  insert into patients (organization_id, responsible_user_id, full_name, status) values (o1.id, u1, 'Paciente Arquivado', 'archived') returning id into pa;

  -- Vínculo só pelos endpoints (variável de sessão)
  ok := false; begin update patients set app_user_id = pu where id = p1;
  exception when others then ok := sqlerrm like '%só muda pelo convite%'; end; assert ok, 'vínculo direto deveria falhar';
  ok := false; begin insert into patients (organization_id, responsible_user_id, full_name, app_user_id) values (o1.id, u1, 'Forjado', pu);
  exception when others then ok := sqlerrm like '%só muda pelo convite%'; end; assert ok, 'cadastro já vinculado deveria falhar';
  update patients set full_name = 'Paciente Um Editado' where id = p1;  -- edição normal segue livre

  perform set_config('rafanutri.patient_link', 'on', true);
  update patients set app_user_id = pu, app_activated_at = now() where id = p1;
  update patients set app_user_id = pu, app_activated_at = now() where id = p2;  -- mesma pessoa em dois consultórios
  perform set_config('rafanutri.patient_link', '', true);
  assert (select count(*) = 2 from patients where app_user_id = pu), 'mesma conta em dois consultórios';

  -- Convites
  insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created, expires_at)
    values (o1.id, p1, ' Paciente@Example.com ', h, u1, now() + interval '30 days') returning id into i1;
  assert (select email = 'paciente@example.com' and expires_at <= now() + interval '7 days 1 minute' from patient_app_invites where id = i1), 'e-mail normalizado e validade de até 7 dias';
  ok := false; begin insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o1.id, p1, 'x@example.com', repeat('b', 64), u1);
  exception when unique_violation then ok := true; end; assert ok, 'um convite pendente por paciente';
  ok := false; begin insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o1.id, p2, 'x@example.com', repeat('c', 64), u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos do consultório%'; end; assert ok, 'paciente de outro consultório deveria falhar';
  ok := false; begin insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o1.id, pa, 'x@example.com', repeat('d', 64), u1);
  exception when others then ok := sqlerrm like '%Só pacientes ativos%'; end; assert ok, 'paciente arquivado deveria falhar';
  ok := false; begin insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o2.id, p2, 'x@example.com', repeat('e', 64), u1);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'autor de outro consultório deveria falhar';
  ok := false; begin insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o2.id, p2, 'sem-arroba', repeat('f', 64), u2);
  exception when check_violation then ok := true; end; assert ok, 'e-mail inválido deveria falhar';

  ok := false; begin update patient_app_invites set email = 'outro@example.com' where id = i1;
  exception when others then ok := sqlerrm like '%não pode ser alterado%'; end; assert ok, 'convite não muda';
  update patient_app_invites set used_at = now(), used_by = pu where id = i1;
  ok := false; begin update patient_app_invites set used_at = clock_timestamp() where id = i1;
  exception when others then ok := sqlerrm like '%já usado%'; end; assert ok, 'uso único';

  -- Revogado não pode ser usado
  update patient_app_invites set revoked_at = now() where id = i1;  -- revogar um usado é inofensivo
  insert into patient_app_invites (organization_id, patient_id, email, token_hash, user_created) values (o2.id, p2, 'x@example.com', repeat('9', 64), u2) returning id into i1;
  update patient_app_invites set revoked_at = now() where id = i1;
  ok := false; begin update patient_app_invites set used_at = now() where id = i1;
  exception when others then ok := sqlerrm like '%revogado não pode ser usado%'; end; assert ok, 'revogado não é usado';

  -- Conta apagada: vínculo some pela cascata
  delete from directus_users where id = pu;
  assert not exists (select 1 from patients where app_user_id = pu), 'conta apagada desfaz o vínculo';

  raise notice '0018_patient_app_access: todos os testes passaram';
end $$;

rollback;
