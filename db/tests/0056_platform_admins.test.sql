-- Testes da migração 0056 (administrador da plataforma). Transação desfeita no fim.
begin;

do $$
declare u uuid := gen_random_uuid();
begin
  insert into directus_users (id, email) values (u, 'pa-user@example.com');
  assert not is_platform_admin(u), 'conta comum não é admin';
  insert into platform_admins (user_id, note) values (u, 'teste');
  assert is_platform_admin(u), 'listada em platform_admins';
  delete from directus_users where id = u;
  assert not exists (select 1 from platform_admins where user_id = u), 'cascata ao apagar a conta';
end $$;

rollback;
