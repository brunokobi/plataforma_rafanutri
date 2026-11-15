-- Testes da migração 0042 (insumos, fornecedores e preços). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  third uuid := gen_random_uuid();
  o1 organizations; o2 organizations; noUan organizations;
  rice uuid; milk uuid; s1 uuid; s2 uuid; theirs uuid; ok boolean; p ingredient_prices;
begin
  insert into directus_users (id, email) values (owner, 'ing-owner@example.com'), (other, 'ing-other@example.com'), (third, 'ing-third@example.com');
  o1 := create_organization(owner, 'Cozinha Insumos', 'company', null, '1', 'CRN-1');
  o2 := create_organization(other, 'Outra Cozinha', 'company', null, '1', 'CRN-2');
  noUan := create_organization(third, 'Consultório Sem UAN', 'solo', null, '1', 'CRN-3');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);

  -- sem módulo: não cadastra
  ok := false; begin insert into ingredients (organization_id, name) values (noUan.id, 'Arroz');
  exception when raise_exception then ok := true; end; assert ok, 'sem módulo UAN';

  insert into ingredients (organization_id, name, category, purchase_unit, allergens) values (o1.id, 'Arroz branco tipo 1', 'grains', 'kg', '{}') returning id into rice;
  insert into ingredients (organization_id, name, category, purchase_unit, density_g_ml, allergens) values (o1.id, 'Leite integral', 'dairy', 'l', 1.03, '{milk,lactose,milk}') returning id into milk;
  assert (select allergens from ingredients where id = milk) = '{lactose,milk}', 'alergênicos sem repetição e ordenados';
  assert (select default_fc from ingredients where id = rice) = 1, 'FC padrão 1';

  -- validações
  ok := false; begin insert into ingredients (organization_id, name) values (o1.id, '  arroz BRANCO tipo 1 ');
  exception when unique_violation then ok := true; end; assert ok, 'nome único na empresa (sem caixa e espaços)';
  ok := false; begin insert into ingredients (organization_id, name, allergens) values (o1.id, 'Bolacha', '{glúten}');
  exception when check_violation then ok := true; end; assert ok, 'alergênico fora da lista';
  ok := false; begin insert into ingredients (organization_id, name, purchase_unit) values (o1.id, 'Ovo', 'dz');
  exception when check_violation then ok := true; end; assert ok, 'dúzia exige peso da unidade';
  ok := false; begin insert into ingredients (organization_id, name, purchase_unit) values (o1.id, 'Óleo', 'cx');
  exception when check_violation then ok := true; end; assert ok, 'caixa exige peso da embalagem';
  ok := false; begin update ingredients set default_fc = 0.9 where id = rice;
  exception when check_violation then ok := true; end; assert ok, 'FC ≥ 1';
  ok := false; begin update ingredients set organization_id = o2.id where id = rice;
  exception when raise_exception then ok := true; end; assert ok, 'não muda de empresa';
  insert into ingredients (organization_id, name) values (o2.id, 'Arroz branco tipo 1'); -- mesmo nome em outra empresa: ok

  -- fornecedores e preços
  insert into suppliers (organization_id, name, cnpj) values (o1.id, 'Atacado Bom Preço', '12345678000190') returning id into s1;
  insert into suppliers (organization_id, name) values (o1.id, 'Hortifrúti do Zé') returning id into s2;
  insert into suppliers (organization_id, name) values (o2.id, 'Fornecedor alheio') returning id into theirs;
  ok := false; begin insert into suppliers (organization_id, name, cnpj) values (o1.id, 'CNPJ errado', '12.345.678/0001-90');
  exception when check_violation then ok := true; end; assert ok, 'CNPJ só dígitos';

  insert into ingredient_prices (ingredient_id, supplier_id, price_cents, valid_from) values (rice, s1, 520, current_date - 30);
  insert into ingredient_prices (ingredient_id, supplier_id, price_cents, valid_from) values (rice, s2, 549, current_date - 2);
  insert into ingredient_prices (ingredient_id, supplier_id, price_cents, valid_from) values (rice, s1, 600, current_date + 10);
  p := ingredient_price_at(rice);
  assert p.price_cents = 549 and p.organization_id = o1.id, 'preço vigente hoje';
  assert (ingredient_price_at(rice, current_date - 10)).price_cents = 520, 'preço vigente no passado';
  assert (ingredient_price_at(rice, current_date + 15)).price_cents = 600, 'preço futuro';
  assert (ingredient_price_at(milk)).id is null, 'sem preço';
  ok := false; begin insert into ingredient_prices (ingredient_id, supplier_id, price_cents) values (rice, theirs, 500);
  exception when raise_exception then ok := true; end; assert ok, 'fornecedor de outra empresa';
  ok := false; begin update ingredient_prices set price_cents = 1 where ingredient_id = rice;
  exception when raise_exception then ok := true; end; assert ok, 'preço não se altera';

  -- apagar fornecedor mantém o preço; apagar a empresa leva tudo
  delete from suppliers where id = s2;
  assert (ingredient_price_at(rice)).supplier_id is null, 'preço sem fornecedor';
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'ingredients' and action = 'insert'), 'insumo auditado';
  delete from organizations where id = o1.id;
  assert not exists (select 1 from ingredients where organization_id = o1.id), 'insumos em cascata';
  assert not exists (select 1 from ingredient_prices where organization_id = o1.id), 'preços em cascata';
end $$;

rollback;
