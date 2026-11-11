-- Testes da migração 0004 (pacientes). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0004_patients.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p uuid; i int; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'pac-a@example.com'), (u2, 'pac-b@example.com');
  o1 := create_organization(u1, 'Consultório A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório B', 'solo', null, '2', 'CRN-2');

  -- criação básica e busca sem acento
  insert into patients (organization_id, responsible_user_id, full_name, cpf, phone)
    values (o1.id, u1, 'Márcia Conceição', '52998224725', '+5531999998888') returning id into p;
  assert (select search_name from patients where id = p) = 'marcia conceicao', 'search_name sem acento';

  -- CPF único no consultório, mas pode repetir em outro consultório
  ok := false;
  begin
    insert into patients (organization_id, full_name, cpf) values (o1.id, 'Outra Pessoa', '52998224725');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'CPF repetido no mesmo consultório deveria falhar';
  insert into patients (organization_id, full_name, cpf) values (o2.id, 'Márcia em B', '52998224725');

  -- responsável precisa ser membro do consultório
  ok := false;
  begin
    insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u2, 'Paciente Errado');
  exception when others then ok := sqlerrm like '%membro do consultório%';
  end;
  assert ok, 'responsável de outro consultório deveria falhar';

  -- paciente não muda de consultório
  ok := false;
  begin
    update patients set organization_id = o2.id where id = p;
  exception when others then ok := sqlerrm like '%mudar de consultório%';
  end;
  assert ok, 'mover paciente de consultório deveria falhar';

  -- limite de 20 ativos no plano gratuito (já existe 1)
  for i in 2..20 loop
    insert into patients (organization_id, full_name) values (o1.id, 'Paciente ' || i);
  end loop;
  ok := false;
  begin
    insert into patients (organization_id, full_name) values (o1.id, 'Paciente 21');
  exception when others then ok := sqlerrm like '%no máximo 20 pacientes ativos%';
  end;
  assert ok, 'o 21º paciente ativo deveria falhar';

  -- arquivado não conta; arquivar libera a vaga; reativar respeita o limite
  insert into patients (organization_id, full_name, status) values (o1.id, 'Paciente arquivado', 'archived');
  update patients set status = 'archived' where id = p;
  insert into patients (organization_id, full_name) values (o1.id, 'Paciente 21 (vaga liberada)');
  ok := false;
  begin
    update patients set status = 'active' where id = p;
  exception when others then ok := sqlerrm like '%no máximo 20 pacientes ativos%';
  end;
  assert ok, 'reativar com o limite cheio deveria falhar';

  -- editar paciente ativo (sem mudar status) não esbarra no limite
  update patients set objective = 'Hipertrofia' where organization_id = o1.id and full_name = 'Paciente 2';

  -- validações de formato
  ok := false;
  begin insert into patients (organization_id, full_name, phone) values (o2.id, 'Telefone Ruim', '31999998888');
  exception when check_violation then ok := true; end;
  assert ok, 'telefone fora do E.164 deveria falhar';
  ok := false;
  begin insert into patients (organization_id, full_name, birth_date) values (o2.id, 'Nasceu Amanhã', current_date + 1);
  exception when check_violation then ok := true; end;
  assert ok, 'data de nascimento futura deveria falhar';

  raise notice '0004_patients: todos os testes passaram';
end $$;

rollback;
