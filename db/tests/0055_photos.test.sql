-- Testes da migração 0055 (fotos da ficha e da recusa no recebimento). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  rt uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; meat uuid; sup uuid; po uuid; rc uuid; sheet uuid; ok boolean;
  ph uuid := gen_random_uuid(); ph2 uuid := gen_random_uuid();
begin
  insert into directus_users (id, email) values (owner, 'ph-owner@example.com'), (rt, 'ph-rt@example.com');
  if exists (select 1 from information_schema.columns where table_name = 'directus_files' and column_name = 'storage') then
    execute format('insert into directus_files (id, storage, filename_download, type) values (%L, ''local'', ''a.jpg'', ''image/jpeg''), (%L, ''local'', ''b.jpg'', ''image/jpeg'')', ph, ph2);
  else
    insert into directus_files (id) values (ph), (ph2);
  end if;
  o1 := create_organization(owner, 'Cozinha Fotos', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into unit_members (unit_id, user_id, role) values (ua, rt, 'technical_lead');
  insert into ingredients (organization_id, name, category, storage) values (o1.id, 'Carne bovina', 'meat', 'chilled') returning id into meat;
  insert into suppliers (organization_id, name) values (o1.id, 'Frigorífico') returning id into sup;

  -- ficha aprovada: foto muda; o resto não; apagar quem aprovou zera a referência
  insert into tech_sheets (organization_id, name, servings) values (o1.id, 'Carne assada', 10) returning id into sheet;
  insert into tech_sheet_items (sheet_id, position, ingredient_id, gross_g) values (sheet, 1, meat, 1000);
  perform tech_sheet_approve(sheet, rt, '{}');
  update tech_sheets set photo = ph where id = sheet;
  assert (select photo from tech_sheets where id = sheet) = ph, 'foto na ficha aprovada';
  ok := false; begin update tech_sheets set name = 'Outra' where id = sheet;
  exception when raise_exception then ok := true; end; assert ok, 'ficha aprovada continua imutável';
  ok := false; begin update tech_sheets set approved_by = null where id = sheet;
  exception when raise_exception then ok := true; end; assert ok, 'zerar referência à mão não';
  delete from unit_members where user_id = rt;
  delete from directus_users where id = rt;
  assert (select approved_by from tech_sheets where id = sheet) is null, 'FK set null na ficha aprovada';

  -- recusa com foto: no item e na não conformidade
  insert into purchase_orders (unit_id, supplier_id) values (ua, sup) returning id into po;
  insert into purchase_order_items (order_id, ingredient_id, quantity_units, unit_price_cents) values (po, meat, 10, 3990);
  update purchase_orders set status = 'sent' where id = po;
  rc := receive_order(po, owner, 'NF 1', null, jsonb_build_array(
    jsonb_build_object('ingredient_id', meat, 'quantity_units', 10, 'accepted', false, 'temperature', 9, 'reject_reason', 'Chegou a 9 °C', 'photo', ph2)));
  assert (select photo from goods_receipt_items where receipt_id = rc) = ph2, 'foto no item recusado';
  assert (select n.photo from goods_receipt_items i join non_conformities n on n.id = i.non_conformity_id where i.receipt_id = rc) = ph2, 'foto na NC';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from tech_sheets where id = sheet), 'cascata';
end $$;

rollback;
