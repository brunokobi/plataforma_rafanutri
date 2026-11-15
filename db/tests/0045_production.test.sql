-- Testes da migração 0045 (comensais e desperdício). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; rice uuid; s1 uuid; alien uuid; ok boolean;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into directus_users (id, email) values (owner, 'pr-owner@example.com'), (other, 'pr-other@example.com');
  o1 := create_organization(owner, 'Cozinha Produção', 'company', null, '1', 'CRN-1');
  o2 := create_organization(other, 'Outra Cozinha', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into ingredients (organization_id, name) values (o1.id, 'Arroz') returning id into rice;
  insert into tech_sheets (organization_id, name) values (o1.id, 'Arroz branco') returning id into s1;
  insert into tech_sheets (organization_id, name) values (o2.id, 'Alheia') returning id into alien;

  -- comensais: um registro por unidade, dia e serviço
  insert into diner_counts (unit_id, day, service, planned) values (ua, today, 'lunch', 300);
  insert into diner_counts (unit_id, day, service, actual) values (ua, today, 'lunch', 287)
    on conflict (unit_id, day, service) do update set actual = excluded.actual;
  assert (select (planned, actual) from diner_counts where unit_id = ua and day = today and service = 'lunch') = (300, 287), 'previsto e realizado';

  -- pesagem por preparação e resto do serviço
  insert into waste_records (unit_id, day, service, sheet_root_id, produced_g, leftover_g, portions_served, reason)
    values (ua, today, 'lunch', s1, 100000, 4000, 250, 'overproduction');
  insert into waste_records (unit_id, day, service, plate_waste_g, reason) values (ua, today, 'lunch', 8000, 'taste');
  assert (select organization_id from waste_records where sheet_root_id = s1) = o1.id, 'organização da unidade';
  ok := false; begin insert into waste_records (unit_id, day, service, sheet_root_id, produced_g) values (ua, today, 'lunch', s1, 1);
  exception when unique_violation then ok := true; end; assert ok, 'um registro por preparação';
  ok := false; begin insert into waste_records (unit_id, day, service, plate_waste_g) values (ua, today, 'lunch', 1);
  exception when unique_violation then ok := true; end; assert ok, 'um registro de serviço';
  ok := false; begin insert into waste_records (unit_id, day, service, sheet_root_id, produced_g, leftover_g) values (ua, today, 'dinner', s1, 1000, 2000);
  exception when check_violation then ok := true; end; assert ok, 'sobra até o produzido';
  ok := false; begin insert into waste_records (unit_id, day, service, sheet_root_id, produced_g) values (ua, today, 'dinner', alien, 1000);
  exception when raise_exception then ok := true; end; assert ok, 'preparação de outra empresa';
  ok := false; begin insert into waste_records (unit_id, day, service, plate_waste_g) values (ua, today + 1, 'dinner', 100);
  exception when raise_exception then ok := true; end; assert ok, 'dia futuro';
  ok := false; begin insert into waste_records (unit_id, day, service, produced_g) values (ua, today, 'dinner', 100);
  exception when check_violation then ok := true; end; assert ok, 'registro do serviço não tem produzido';

  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'waste_records'), 'auditado';
  delete from organizations where id = o1.id;
  assert not exists (select 1 from waste_records where organization_id = o1.id), 'cascata';
  assert not exists (select 1 from diner_counts where unit_id = ua), 'cascata comensais';
end $$;

rollback;
