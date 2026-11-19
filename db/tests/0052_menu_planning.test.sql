-- Testes da migração 0052 (perfis, regras e autonomia do cardápio). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; pat uuid; mine uuid; other_prof uuid; rice uuid; alien uuid; sheet uuid; cyc uuid; ok boolean;
begin
  insert into directus_users (id, email) values (owner, 'mp-owner@example.com'), (gen_random_uuid(), 'mp-o2@example.com');
  o1 := create_organization(owner, 'Cozinha Perfis', 'company', null, '1', 'CRN-1');
  o2 := create_organization((select id from directus_users where email = 'mp-o2@example.com'), 'Outra Perfis', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;

  select id into pat from diner_profiles where code = 'pat-grande-refeicao' and organization_id is null;
  assert pat is not null and not (select validated from diner_profiles where id = pat), 'PAT da plataforma, a validar';
  assert (select (targets -> 'energy_kcal' ->> 'min')::int from diner_profiles where id = pat) = 600, 'meta de energia';
  ok := false; begin update diner_profiles set name = 'x' where id = pat;
  exception when raise_exception then ok := true; end; assert ok, 'perfil da plataforma só leitura';
  ok := false; begin insert into diner_profiles (organization_id, name, segment) values (null, 'Novo', 'pat');
  exception when raise_exception then ok := true; end; assert ok, 'sem criar perfil da plataforma';

  mine := diner_profile_copy(pat, o1.id, owner);
  assert (select organization_id = o1.id and copied_from = pat and not validated and name like '%personalizado' from diner_profiles where id = mine), 'cópia';
  update diner_profiles set targets = '{"energy_kcal": {"min": 650, "max": 850}}', validated = true where id = mine;
  ok := false; begin update diner_profiles set targets = '{"energy_kcal": {"min": 900, "max": 800}}' where id = mine;
  exception when raise_exception then ok := true; end; assert ok, 'mínimo maior que máximo';
  ok := false; begin update diner_profiles set targets = '{"energy_kcal": 700}' where id = mine;
  exception when raise_exception then ok := true; end; assert ok, 'meta precisa ser objeto';
  insert into diner_profiles (organization_id, name, segment) values (o2.id, 'Alheio', 'other') returning id into other_prof;

  insert into ingredients (organization_id, name) values (o1.id, 'Fígado') returning id into rice;
  insert into ingredients (organization_id, name) values (o2.id, 'Alheio') returning id into alien;
  insert into menu_rules (organization_id, profile_id, kind, ingredient_id) values (o1.id, mine, 'vetoed_ingredient', rice);
  insert into menu_rules (organization_id, kind, slot, service) values (o1.id, 'required_daily', 'salad', 'lunch');
  insert into menu_rules (organization_id, kind, sheet_category, max_count) values (o1.id, 'max_per_week', 'main', 2);
  insert into menu_rules (organization_id, kind, cost_cents) values (o1.id, 'cost_ceiling', 1200);
  ok := false; begin insert into menu_rules (organization_id, kind) values (o1.id, 'vetoed_ingredient');
  exception when check_violation then ok := true; end; assert ok, 'veto exige insumo';
  ok := false; begin insert into menu_rules (organization_id, kind, ingredient_id) values (o1.id, 'vetoed_ingredient', alien);
  exception when raise_exception then ok := true; end; assert ok, 'insumo de outra empresa';
  ok := false; begin insert into menu_rules (organization_id, profile_id, kind, cost_cents) values (o1.id, other_prof, 'cost_ceiling', 1);
  exception when raise_exception then ok := true; end; assert ok, 'perfil de outra empresa';

  insert into menu_cycles (unit_id, organization_id, name, starts_on, profile_id, autonomy) values (ua, o1.id, 'Ciclo', current_date, mine, 'standardized') returning id into cyc;
  assert (select profile_id from menu_cycles where id = cyc) = mine, 'ciclo com perfil';
  ok := false; begin update menu_cycles set profile_id = other_prof where id = cyc;
  exception when raise_exception then ok := true; end; assert ok, 'ciclo com perfil de outra empresa';
  ok := false; begin update menu_cycles set autonomy = 'x' where id = cyc;
  exception when check_violation then ok := true; end; assert ok, 'autonomia válida';

  insert into tech_sheets (organization_id, name, servings) values (o1.id, 'Arroz', 10) returning id into sheet;
  insert into unit_sheet_adjustments (unit_id, sheet_root_id, portion_factor) values (ua, sheet, 1.2);
  assert (select organization_id from unit_sheet_adjustments where unit_id = ua) = o1.id, 'ajuste local';
  ok := false; begin insert into unit_sheet_adjustments (unit_id, sheet_root_id, portion_factor) values (ua, sheet, 1.1);
  exception when unique_violation then ok := true; end; assert ok, 'um ajuste por ficha e unidade';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from diner_profiles where organization_id = o1.id), 'cascata';
  assert exists (select 1 from diner_profiles where id = pat), 'perfil da plataforma fica';
end $$;

rollback;
