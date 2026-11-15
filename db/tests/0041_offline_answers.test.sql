-- Testes da migração 0041 (horário original da resposta). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations; ua uuid; tpl uuid; run uuid; t timestamptz;
begin
  insert into directus_users (id, email) values (owner, 'off-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Offline', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  select id into tpl from checklist_templates where code = 'higiene-manipuladores' and organization_id is null;
  run := checklist_start(ua, tpl, owner, gen_random_uuid());

  -- horário do aparelho de 2 h atrás: mantido
  update checklist_answers set value = 'conform', answered_at = now() - interval '2 hours' where run_id = run and position = 1;
  select answered_at into t from checklist_answers where run_id = run and position = 1;
  assert t = now() - interval '2 hours', 'horário original';
  -- de 5 dias atrás: substituído pelo do servidor
  update checklist_answers set value = 'conform', answered_at = now() - interval '5 days' where run_id = run and position = 2;
  assert (select answered_at from checklist_answers where run_id = run and position = 2) = now(), 'velho demais';
  -- no futuro: limitado a agora
  update checklist_answers set value = 'conform', answered_at = now() + interval '2 minutes' where run_id = run and position = 3;
  assert (select answered_at from checklist_answers where run_id = run and position = 3) = now(), 'futuro vira agora';
  -- sem horário: o do servidor
  update checklist_answers set value = 'conform' where run_id = run and position = 4;
  assert (select answered_at from checklist_answers where run_id = run and position = 4) = now(), 'servidor';
end $$;

rollback;
