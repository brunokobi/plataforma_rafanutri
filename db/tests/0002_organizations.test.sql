-- Testes da migração 0002 (regras do banco). Roda numa transação desfeita no final:
--   psql -v ON_ERROR_STOP=1 -f db/tests/0002_organizations.test.sql
-- Qualquer falha interrompe com erro. Precisa das tabelas directus_users (já existem no Directus).

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o1b organizations; o2 organizations; o3 organizations;
  n int; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'teste-a@rafanutri.test'), (u2, 'teste-b@rafanutri.test');

  -- create_organization cria organização, owner e perfil numa vez
  o1 := create_organization(u1, '  Clínica Nutri Bem ', 'clinic', '#2E7D32', '12345', 'CRN-4');
  assert o1.name = 'Clínica Nutri Bem', 'nome deve vir sem espaços nas pontas';
  assert o1.slug = 'clinica-nutri-bem', format('slug inesperado: %s', o1.slug);
  assert o1.plan = 'free', 'plano inicial deve ser free';
  select count(*) into n from organization_members where organization_id = o1.id and user_id = u1 and role = 'owner';
  assert n = 1, 'owner não foi criado';
  select count(*) into n from professional_profiles where user_id = u1 and crn = '12345' and crn_region = 'CRN-4';
  assert n = 1, 'perfil profissional não foi criado';

  -- idempotente: segunda chamada devolve a mesma organização
  o1b := create_organization(u1, 'Outro nome', 'solo', null, '12345', 'CRN-4');
  assert o1b.id = o1.id, 'segunda chamada não deveria criar outra organização';
  select count(*) into n from organizations o join organization_members m on m.organization_id = o.id where m.user_id = u1;
  assert n = 1, 'usuário ficou com mais de uma organização';

  -- slug único para nomes iguais
  o2 := create_organization(u2, 'Clínica Nutri Bem', 'solo', null, '999', 'CRN-1');
  assert o2.slug = 'clinica-nutri-bem-2', format('slug repetido deveria ganhar sufixo: %s', o2.slug);

  -- plano gratuito: no máximo 1 membro
  ok := false;
  begin
    insert into organization_members (organization_id, user_id, role) values (o1.id, u2, 'nutritionist');
  exception when others then ok := sqlerrm like '%no máximo 1 membro%';
  end;
  assert ok, 'limite de membros do plano gratuito não foi aplicado';

  -- último owner não pode ser rebaixado nem removido
  ok := false;
  begin
    update organization_members set role = 'nutritionist' where organization_id = o1.id and user_id = u1;
  exception when others then ok := sqlerrm like '%ao menos um owner%';
  end;
  assert ok, 'rebaixar o último owner deveria falhar';
  ok := false;
  begin
    delete from organization_members where organization_id = o1.id and user_id = u1;
  exception when others then ok := sqlerrm like '%ao menos um owner%';
  end;
  assert ok, 'remover o último owner deveria falhar';

  -- apagar a organização inteira leva os membros junto (cascade não esbarra no gatilho)
  delete from organizations where id = o2.id;
  select count(*) into n from organization_members where organization_id = o2.id;
  assert n = 0, 'membros da organização apagada deveriam sumir';

  -- validações de formato
  ok := false;
  begin
    perform create_organization(u2, 'X', 'solo', null, '1', 'CRN-1');
  exception when check_violation then ok := true;
  end;
  assert ok, 'nome com 1 caractere deveria falhar';
  ok := false;
  begin
    perform create_organization(u2, 'Consultório', 'solo', 'verde', '1', 'CRN-1');
  exception when check_violation then ok := true;
  end;
  assert ok, 'cor fora do formato #RRGGBB deveria falhar';
  ok := false;
  begin
    perform create_organization(u2, 'Consultório', 'solo', null, '1', 'CRN-12');
  exception when check_violation then ok := true;
  end;
  assert ok, 'regional CRN-12 deveria falhar';

  -- slug sem acento e sem símbolos
  o3 := create_organization(u2, 'Espaço Ação & Saúde!!', 'solo', null, '1', 'CRN-1');
  assert o3.slug = 'espaco-acao-saude', format('slug inesperado: %s', o3.slug);

  raise notice '0002_organizations: todos os testes passaram';
end $$;

rollback;
