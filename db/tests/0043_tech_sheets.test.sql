-- Testes da migração 0043 (fichas técnicas). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  rt uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  ua uuid; rice uuid; onion uuid; alien uuid; a uuid; b uuid; v2 uuid; ok boolean; s tech_sheets;
begin
  insert into directus_users (id, email) values (owner, 'ts-owner@example.com'), (rt, 'ts-rt@example.com'), (cook, 'ts-cook@example.com'), (other, 'ts-other@example.com');
  o1 := create_organization(owner, 'Cozinha Fichas', 'company', null, '1', 'CRN-1');
  o2 := create_organization(other, 'Outra Cozinha', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{clinical,uan}' where id in (o1.id, o2.id);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into unit_members (unit_id, user_id, role) values (ua, rt, 'technical_lead'), (ua, cook, 'cook');
  insert into ingredients (organization_id, name, category) values (o1.id, 'Arroz', 'grains') returning id into rice;
  insert into ingredients (organization_id, name, category, default_fc) values (o1.id, 'Cebola', 'produce', 1.25) returning id into onion;
  insert into ingredients (organization_id, name) values (o2.id, 'Arroz alheio') returning id into alien;

  -- ficha A e sub-receita B
  insert into tech_sheets (organization_id, name, servings, status) values (o1.id, 'Arroz branco', 10, 'approved') returning id into a;
  assert (select (status, root_id, version) from tech_sheets where id = a) = ('draft'::text, a, 1), 'nasce rascunho, raiz = ela mesma';
  insert into tech_sheets (organization_id, name, servings, category) values (o1.id, 'Refogado base', 4, 'base') returning id into b;
  insert into tech_sheet_items (sheet_id, position, ingredient_id, gross_g) values (a, 1, rice, 1000), (b, 1, onion, 200);
  insert into tech_sheet_items (sheet_id, position, sub_sheet_id, gross_g) values (a, 2, b, 100);
  insert into tech_sheet_steps (sheet_id, position, text, critical, target_temp) values (a, 1, 'Cozinhar até 74 °C no centro', true, 74);

  -- ciclo, insumo alheio, item duplo
  ok := false; begin insert into tech_sheet_items (sheet_id, position, sub_sheet_id, gross_g) values (b, 2, a, 50);
  exception when raise_exception then ok := sqlerrm like '%ciclo%'; end; assert ok, 'B não pode usar A (A usa B)';
  ok := false; begin insert into tech_sheet_items (sheet_id, position, sub_sheet_id, gross_g) values (a, 3, a, 50);
  exception when raise_exception then ok := true; end; assert ok, 'A não usa a si mesma';
  ok := false; begin insert into tech_sheet_items (sheet_id, position, ingredient_id, gross_g) values (a, 3, alien, 10);
  exception when raise_exception then ok := true; end; assert ok, 'insumo de outra empresa';
  ok := false; begin insert into tech_sheet_items (sheet_id, position, ingredient_id, sub_sheet_id, gross_g) values (a, 3, rice, b, 10);
  exception when check_violation then ok := true; end; assert ok, 'insumo ou sub-receita, não os dois';

  -- aprovar: só RT ou owner; direto pelo update não
  ok := false; begin update tech_sheets set status = 'approved' where id = a;
  exception when raise_exception then ok := true; end; assert ok, 'aprovar só pela função';
  ok := false; begin perform tech_sheet_approve(a, cook, '{}');
  exception when raise_exception then ok := sqlerrm like 'Só o RT%'; end; assert ok, 'cozinheiro não aprova';
  s := tech_sheet_approve(a, rt, '{"costCents": 600}');
  assert s.status = 'approved' and s.approved_by = rt and s.computed ->> 'costCents' = '600', 'aprovada pelo RT';

  -- aprovada é imutável
  ok := false; begin update tech_sheets set name = 'Outro' where id = a;
  exception when raise_exception then ok := true; end; assert ok, 'dados imutáveis';
  ok := false; begin update tech_sheet_items set gross_g = 2000 where sheet_id = a and position = 1;
  exception when raise_exception then ok := true; end; assert ok, 'itens imutáveis';
  ok := false; begin delete from tech_sheet_steps where sheet_id = a;
  exception when raise_exception then ok := true; end; assert ok, 'passos imutáveis';
  ok := false; begin delete from tech_sheets where id = a;
  exception when raise_exception then ok := true; end; assert ok, 'aprovada não se apaga';

  -- nova versão: rascunho copiado; a v1 intacta; aprovar a v2 arquiva a v1
  v2 := tech_sheet_new_version(a, owner);
  assert (select (version, parent_id, root_id, status) from tech_sheets where id = v2) = (2, a, a, 'draft'::text), 'versão 2';
  assert (select count(*) from tech_sheet_items where sheet_id = v2) = 2 and (select count(*) from tech_sheet_steps where sheet_id = v2) = 1, 'itens e passos copiados';
  ok := false; begin perform tech_sheet_new_version(a, owner);
  exception when raise_exception then ok := true; end; assert ok, 'um rascunho por vez';
  update tech_sheet_items set gross_g = 2000 where sheet_id = v2 and position = 1;
  assert (select gross_g from tech_sheet_items where sheet_id = a and position = 1) = 1000, 'v1 intacta';
  perform tech_sheet_approve(v2, owner, '{}');
  assert (select status from tech_sheets where id = a) = 'archived', 'v1 arquivada';
  assert (select status from tech_sheets where id = v2) = 'approved', 'v2 aprovada';

  -- rascunho se apaga; apagar a empresa leva tudo
  insert into tech_sheets (organization_id, name) values (o1.id, 'Teste') returning id into b;
  delete from tech_sheets where id = b;
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'tech_sheets' and action = 'update'), 'auditada';
  delete from organizations where id = o1.id;
  assert not exists (select 1 from tech_sheets where organization_id = o1.id), 'fichas em cascata';
end $$;

rollback;
