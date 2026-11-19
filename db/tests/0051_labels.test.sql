-- Testes da migração 0051 (rótulos nutricionais). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations; sheet uuid; draft uuid; lbl uuid; ok boolean; l nutrition_labels;
begin
  insert into directus_users (id, email) values (owner, 'lb-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Rótulos', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into ingredients (organization_id, name, added_sugar_g_100g) values (o1.id, 'Doce de leite', 45);
  ok := false; begin insert into ingredients (organization_id, name, added_sugar_g_100g) values (o1.id, 'X', 120);
  exception when check_violation then ok := true; end; assert ok, 'açúcar adicionado até 100 g';

  insert into tech_sheets (organization_id, name, servings) values (o1.id, 'Bolo', 10) returning id into draft;
  ok := false; begin insert into nutrition_labels (sheet_id, product_name, portion_g, household_measure, values) values (draft, 'Bolo', 60, '1 fatia', '{}');
  exception when raise_exception then ok := true; end; assert ok, 'rótulo só de ficha aprovada';
  insert into tech_sheet_items (sheet_id, position, ingredient_id, gross_g) values (draft, 1, (select id from ingredients where organization_id = o1.id and name = 'Doce de leite'), 100);
  perform tech_sheet_approve(draft, owner, '{}');
  insert into nutrition_labels (organization_id, sheet_id, product_name, portion_g, household_measure, values, front_warnings, allergens)
  values (gen_random_uuid(), draft, 'Bolo', 60, '1 fatia', '{"per100": {"energy_kcal": 350}}', '{added_sugar}', '{milk,gluten}') returning id into lbl;
  select * into l from nutrition_labels where id = lbl;
  assert l.organization_id = o1.id and l.sheet_root_id = draft and l.sheet_version = 1, 'empresa e versão da ficha';
  ok := false; begin update nutrition_labels set portion_g = 80 where id = lbl;
  exception when raise_exception then ok := true; end; assert ok, 'rótulo emitido imutável';
  update nutrition_labels set archived = true where id = lbl;
  ok := false; begin update nutrition_labels set archived = false where id = lbl;
  exception when raise_exception then ok := true; end; assert ok, 'não desarquiva';
  ok := false; begin insert into nutrition_labels (sheet_id, product_name, portion_g, household_measure, values, front_warnings) values (draft, 'Bolo', 60, '1 fatia', '{}', '{fat}');
  exception when check_violation then ok := true; end; assert ok, 'lupa só açúcar, saturada e sódio';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from nutrition_labels where id = lbl), 'cascata';
end $$;

rollback;
