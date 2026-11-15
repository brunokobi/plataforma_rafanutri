-- Testes da migração 0046 (estoque, FEFO e inventário). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  rt uuid := gen_random_uuid();
  keeper uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; milk uuid; rice uuid; l1 uuid; l2 uuid; inv uuid; ok boolean; n integer;
begin
  insert into directus_users (id, email) values (owner, 'st-owner@example.com'), (rt, 'st-rt@example.com'), (keeper, 'st-keeper@example.com');
  o1 := create_organization(owner, 'Cozinha Estoque', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into unit_members (unit_id, user_id, role) values (ua, rt, 'technical_lead'), (ua, keeper, 'stock_keeper');
  insert into ingredients (organization_id, name, purchase_unit, density_g_ml) values (o1.id, 'Leite', 'l', 1.03) returning id into milk;
  insert into ingredients (organization_id, name) values (o1.id, 'Arroz') returning id into rice;

  -- só pelas funções
  ok := false; begin insert into stock_lots (organization_id, unit_id, ingredient_id, quantity_g) values (o1.id, ua, milk, 100);
  exception when raise_exception then ok := true; end; assert ok, 'lote direto recusado';

  -- dois lotes de leite: 10/05 e 05/05 → a saída consome primeiro o de 05/05
  l1 := stock_receive(ua, milk, 5000, 'L-10', '2026-05-10', null, 650, keeper);
  l2 := stock_receive(ua, milk, 3000, 'L-05', '2026-05-05', null, 640, keeper);
  n := stock_out_fefo(ua, milk, 2000, 'out_production', null, keeper);
  assert n = 1, 'um lote usado';
  assert (select quantity_g from stock_lots where id = l2) = 1000 and (select quantity_g from stock_lots where id = l1) = 5000, 'FEFO: consome o que vence antes';
  n := stock_out_fefo(ua, milk, 3000, 'out_production', null, keeper);
  assert n = 2 and (select quantity_g from stock_lots where id = l2) = 0 and (select quantity_g from stock_lots where id = l1) = 3000, 'passa para o próximo lote';

  -- saldo insuficiente: falha sem mexer
  ok := false; begin perform stock_out_fefo(ua, milk, 3001, 'out_production', null, keeper);
  exception when raise_exception then ok := sqlerrm like 'Saldo insuficiente%'; end; assert ok, 'não fica negativo';
  assert (select quantity_g from stock_lots where id = l1) = 3000, 'nada mudou';
  ok := false; begin perform stock_out_fefo(ua, milk, 100, 'out_loss', ' ', keeper);
  exception when raise_exception then ok := true; end; assert ok, 'perda exige motivo';
  perform stock_out_fefo(ua, milk, 500, 'out_loss', 'Embalagem estufada', keeper);
  assert (select count(*) from stock_movements where unit_id = ua and kind = 'out_loss' and reason = 'Embalagem estufada') = 1, 'perda com motivo';
  assert (select quantity_g from stock_balance where unit_id = ua and ingredient_id = milk) = 2500, 'saldo pela visão';

  -- inventário: contagem cega, divergência com motivo, aprovação só RT/owner
  inv := inventory_open(ua, keeper);
  assert (select system_g from inventory_counts where inventory_id = inv and ingredient_id = milk) = 2500, 'saldo do sistema guardado';
  ok := false; begin perform inventory_open(ua, keeper);
  exception when raise_exception then ok := true; end; assert ok, 'um inventário aberto por vez';
  update inventory_counts set counted_g = 500 where inventory_id = inv and ingredient_id = milk;   -- faltam 2 kg
  update inventory_counts set counted_g = 1000 where inventory_id = inv and ingredient_id = rice; -- sobra 1 kg
  ok := false; begin perform inventory_approve(inv, keeper);
  exception when raise_exception then ok := sqlerrm like 'Só o RT%'; end; assert ok, 'estoquista não aprova';
  ok := false; begin perform inventory_approve(inv, rt);
  exception when raise_exception then ok := sqlerrm like '%motivo%'; end; assert ok, 'divergência exige motivo';
  update inventory_counts set reason = 'Contagem física' where inventory_id = inv;
  n := inventory_approve(inv, rt);
  assert n = 2, 'dois ajustes';
  assert (select quantity_g from stock_balance where unit_id = ua and ingredient_id = milk) = 500, 'falta ajustada';
  assert (select quantity_g from stock_balance where unit_id = ua and ingredient_id = rice) = 1000, 'sobra ajustada';
  assert exists (select 1 from stock_movements where kind = 'adjustment' and quantity_g = -2000 and ref_id = inv), 'movimento de ajuste';
  assert (select status from inventories where id = inv) = 'approved', 'aprovado';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from stock_lots where organization_id = o1.id), 'cascata';
end $$;

rollback;
