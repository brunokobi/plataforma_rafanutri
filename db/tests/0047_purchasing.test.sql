-- Testes da migração 0047 (pedido de compra e recebimento). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; meat uuid; milk uuid; sup uuid; po uuid; rc uuid; ok boolean;
begin
  insert into directus_users (id, email) values (owner, 'po-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Compras', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into ingredients (organization_id, name, category, storage) values (o1.id, 'Carne bovina', 'meat', 'chilled') returning id into meat;
  insert into ingredients (organization_id, name, purchase_unit, density_g_ml) values (o1.id, 'Leite', 'l', 1.03) returning id into milk;
  insert into suppliers (organization_id, name) values (o1.id, 'Frigorífico') returning id into sup;

  insert into purchase_orders (unit_id, supplier_id, status) values (ua, sup, 'received') returning id into po;
  assert (select (status, organization_id) from purchase_orders where id = po) = ('draft'::text, o1.id), 'nasce rascunho';
  insert into purchase_order_items (order_id, ingredient_id, quantity_units, unit_price_cents) values (po, meat, 10, 3990), (po, milk, 20, 650);
  ok := false; begin perform receive_order(po, owner, null, null, '[{"ingredient_id":"x"}]');
  exception when raise_exception then ok := sqlerrm like 'Só pedido enviado%'; end; assert ok, 'rascunho não recebe';
  update purchase_orders set status = 'sent' where id = po;
  assert (select sent_at from purchase_orders where id = po) is not null, 'enviado em';
  ok := false; begin update purchase_order_items set quantity_units = 1 where order_id = po and ingredient_id = meat;
  exception when raise_exception then ok := true; end; assert ok, 'itens só no rascunho';

  -- leite aceito (20 L → 20,6 kg), carne recusada a 9 °C sem motivo: falha; com motivo: abre NC
  ok := false; begin perform receive_order(po, owner, 'NF 123', null, jsonb_build_array(
    jsonb_build_object('ingredient_id', meat, 'quantity_units', 10, 'accepted', false, 'temperature', 9)));
  exception when raise_exception then ok := sqlerrm like 'Informe o motivo%'; end; assert ok, 'recusa exige motivo';
  rc := receive_order(po, owner, 'NF 123', 'Entrega às 7h', jsonb_build_array(
    jsonb_build_object('ingredient_id', milk, 'quantity_units', 20, 'accepted', true, 'lot_code', 'L9', 'expires_on', '2030-01-01', 'unit_price_cents', 650),
    jsonb_build_object('ingredient_id', meat, 'quantity_units', 10, 'accepted', false, 'temperature', 9, 'reject_reason', 'Carne refrigerada chegou a 9 °C')));
  assert (select status from purchase_orders where id = po) = 'received', 'pedido recebido';
  assert (select quantity_g from stock_balance where unit_id = ua and ingredient_id = milk) = 20600, 'estoque em gramas pela densidade';
  assert (select received_units from purchase_order_items where order_id = po and ingredient_id = milk) = 20, 'quantidade recebida';
  assert (ingredient_price_at(milk)).source = 'receiving', 'preço atualizado pelo recebimento';
  assert exists (select 1 from non_conformities where unit_id = ua and source = 'receiving' and title like '%Carne bovina%' and description like '%9 °C%'), 'NC do recebimento';
  assert (select count(*) from goods_receipt_items where receipt_id = rc) = 2, 'itens do recebimento';
  ok := false; begin insert into goods_receipts (organization_id, unit_id) values (o1.id, ua);
  exception when raise_exception then ok := true; end; assert ok, 'recebimento só pela função';
  ok := false; begin update purchase_orders set notes = 'x' where id = po;
  exception when raise_exception then ok := true; end; assert ok, 'recebido não se altera';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from purchase_orders where organization_id = o1.id), 'cascata';
end $$;

rollback;
