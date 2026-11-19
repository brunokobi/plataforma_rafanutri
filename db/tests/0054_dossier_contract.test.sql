-- Testes da migração 0054 (licenças, emissões e contrato). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; ct uuid; inv uuid; e1 uuid; e2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (owner, 'dc-owner@example.com'), (gen_random_uuid(), 'dc-o2@example.com');
  o1 := create_organization(owner, 'Cozinha Dossiê', 'company', null, '1', 'CRN-1');
  o2 := create_organization((select id from directus_users where email = 'dc-o2@example.com'), 'Sem contrato', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);
  insert into organization_contracts (organization_id, plan, units_contracted, starts_at, ends_at) values (o1.id, 'uan_quality', 2, current_date - 400, current_date - 30) returning id into ct;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;

  insert into unit_licenses (unit_id, kind, number, issued_on, valid_until) values (ua, 'sanitary_permit', 'AL-123', current_date - 300, current_date + 65);
  assert (select organization_id from unit_licenses where unit_id = ua) = o1.id, 'empresa da unidade';
  ok := false; begin insert into unit_licenses (unit_id, kind, issued_on, valid_until) values (ua, 'pest_control', current_date, current_date - 1);
  exception when check_violation then ok := true; end; assert ok, 'validade depois da emissão';

  insert into compliance_exports (unit_id, kind, includes) values (ua, 'manual', '{"documents": []}') returning id into e1;
  insert into compliance_exports (unit_id, kind, includes, edition) values (ua, 'manual', '{}', 9) returning id into e2;
  assert (select edition from compliance_exports where id = e1) = 1 and (select edition from compliance_exports where id = e2) = 2, 'edições numeradas';
  ok := false; begin insert into compliance_exports (unit_id, kind) values (ua, 'dossier');
  exception when check_violation then ok := true; end; assert ok, 'dossiê exige período';
  insert into compliance_exports (unit_id, kind, period_from, period_to, integrity) values (ua, 'dossier', current_date - 30, current_date, '{"ok": 10, "divergent": 0}');
  ok := false; begin update compliance_exports set includes = '{"x": 1}' where id = e1;
  exception when raise_exception then ok := true; end; assert ok, 'emissão imutável';
  ok := false; begin delete from compliance_exports where id = e1;
  exception when raise_exception then ok := true; end; assert ok, 'emissão não se apaga';

  -- contrato: terminou há 30 dias → modo leitura; 120 dias → encerrado
  assert uan_contract_state(o1.id) = 'read_only', 'modo leitura até 90 dias';
  assert uan_contract_state(o2.id) = 'none', 'sem contrato';
  update organization_contracts set ends_at = current_date - 120 where id = ct;
  assert uan_contract_state(o1.id) = 'ended', 'encerrado depois de 90 dias';
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_quality', 3);
  assert uan_contract_state(o1.id) = 'active', 'contrato vigente';

  insert into contract_invoices (contract_id, period_start, period_end, amount_cents, due_on) values (ct, '2026-01-01', '2026-01-31', 50000, '2026-02-05') returning id into inv;
  assert (select organization_id from contract_invoices where id = inv) = o1.id, 'empresa do contrato';
  ok := false; begin update contract_invoices set amount_cents = 1 where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'valor não muda';
  ok := false; begin update contract_invoices set status = 'paid' where id = inv;
  exception when check_violation then ok := true; end; assert ok, 'paga exige data';
  update contract_invoices set status = 'paid', paid_at = now() where id = inv;
  ok := false; begin update contract_invoices set status = 'void', paid_at = null where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'paga não volta';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from compliance_exports where unit_id = ua), 'cascata';
end $$;

rollback;
