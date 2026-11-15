-- Testes da migração 0044 (cardápio cíclico e aprovação). Transação desfeita no fim.
begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; rice uuid; s1 uuid; s1v2 uuid; draftSheet uuid; cyc uuid; ok boolean; c menu_cycles;
begin
  insert into directus_users (id, email) values (owner, 'mn-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Cardápio', 'company', null, '1', 'CRN-1');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into ingredients (organization_id, name) values (o1.id, 'Arroz') returning id into rice;
  insert into tech_sheets (organization_id, name, category) values (o1.id, 'Arroz branco', 'side') returning id into s1;
  insert into tech_sheet_items (sheet_id, position, ingredient_id, gross_g) values (s1, 1, rice, 1000);
  perform tech_sheet_approve(s1, owner, '{"costPerServingCents": 120}');
  insert into tech_sheets (organization_id, name, category) values (o1.id, 'Rascunho', 'main') returning id into draftSheet;

  -- ciclo de 28 dias começando em 01/03: 30/03 é o dia 2
  insert into menu_cycles (unit_id, name, starts_on, length_days, services, status) values (ua, 'Ciclo de março', '2026-03-01', 28, '{lunch,dinner}', 'approved') returning id into cyc;
  assert (select (status, organization_id) from menu_cycles where id = cyc) = ('draft'::text, o1.id), 'nasce rascunho';
  assert menu_day_index(cyc, '2026-03-30') = 2, 'dia 2 do ciclo';
  assert menu_day_index(cyc, '2026-03-01') = 1 and menu_day_index(cyc, '2026-03-28') = 28, 'limites';
  assert menu_day_index(cyc, '2026-02-28') is null, 'antes do início';

  -- itens: só ficha aprovada (raiz) da empresa; dia, serviço e posição do ciclo
  insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 1, 'lunch', 'side', s1);
  ok := false; begin insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 1, 'lunch', 'main', draftSheet);
  exception when raise_exception then ok := true; end; assert ok, 'rascunho não entra';
  ok := false; begin insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 29, 'lunch', 'side', s1);
  exception when raise_exception then ok := true; end; assert ok, 'dia fora do ciclo';
  ok := false; begin insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 2, 'breakfast', 'side', s1);
  exception when raise_exception then ok := true; end; assert ok, 'serviço fora do ciclo';

  -- nova versão da ficha: o cardápio continua apontando para a raiz
  s1v2 := tech_sheet_new_version(s1, owner);
  perform tech_sheet_approve(s1v2, owner, '{"costPerServingCents": 130}');
  insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 2, 'lunch', 'side', s1);
  ok := false; begin insert into menu_items (cycle_id, day_index, service, slot, sheet_root_id) values (cyc, 3, 'lunch', 'side', s1v2);
  exception when raise_exception then ok := true; end; assert ok, 'sempre a raiz, não a versão';

  -- fluxo: situação só pelas funções; devolver exige motivo
  ok := false; begin update menu_cycles set status = 'approved' where id = cyc;
  exception when raise_exception then ok := true; end; assert ok, 'status só pelo fluxo';
  ok := false; begin perform menu_transition(cyc, owner, 'approve');
  exception when raise_exception then ok := true; end; assert ok, 'rascunho não aprova direto';
  c := menu_transition(cyc, owner, 'submit', 'Acima do teto por causa do peixe', '{"over": 1}');
  assert c.status = 'submitted' and c.justification is not null, 'enviado com justificativa';
  ok := false; begin perform menu_transition(cyc, owner, 'return', ' ');
  exception when raise_exception then ok := true; end; assert ok, 'devolver exige motivo';
  c := menu_transition(cyc, owner, 'approve');
  assert c.status = 'approved' and c.approved_by = owner, 'aprovado';

  -- mudar item de aprovado volta para rascunho e fica no histórico
  update menu_items set day_index = 3 where cycle_id = cyc and day_index = 2;
  assert (select status from menu_cycles where id = cyc) = 'draft', 'reaberto';
  assert exists (select 1 from menu_approvals where cycle_id = cyc and action = 'reopened'), 'histórico de reabertura';
  assert (select count(*) from menu_approvals where cycle_id = cyc) = 3, 'enviado, aprovado, reaberto';
  -- mudar dados do ciclo enviado também reabre
  perform menu_transition(cyc, owner, 'submit');
  update menu_cycles set name = 'Ciclo de março (rev.)' where id = cyc;
  assert (select status from menu_cycles where id = cyc) = 'draft', 'dados alterados reabrem';

  delete from organizations where id = o1.id;
  assert not exists (select 1 from menu_cycles where organization_id = o1.id), 'cardápios em cascata';
end $$;

rollback;
