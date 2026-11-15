-- Testes da migração 0040 (assinatura do checklist). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  ph uuid := gen_random_uuid();
  o1 organizations; ua uuid; tpl uuid; run uuid; ok boolean;
begin
  insert into directus_users (id, email) values (owner, 'sg-owner@example.com');
  if exists (select 1 from information_schema.columns where table_name = 'directus_files' and column_name = 'storage') then
    execute format('insert into directus_files (id, storage, filename_download, type) values (%L, ''local'', ''assinatura.png'', ''image/png'')', ph);
  else
    insert into directus_files (id) values (ph);
  end if;
  o1 := create_organization(owner, 'Cozinha Assinatura', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  select id into tpl from checklist_templates where code = 'higiene-manipuladores' and organization_id is null;
  run := checklist_start(ua, tpl, owner, gen_random_uuid());
  update checklist_runs set signature = ph, signed_by = owner where id = run;
  update checklist_answers set value = 'conform' where run_id = run;
  perform checklist_complete(run, owner);
  assert (select (signature, signed_by) from checklist_runs where id = run) = (ph, owner), 'assinatura gravada';
  ok := false; begin update checklist_runs set signature = null where id = run;
  exception when raise_exception then ok := true; end; assert ok, 'concluído: assinatura não muda';
end $$;

rollback;
