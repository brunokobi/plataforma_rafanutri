-- Testes da migração 0034 (convite da equipe da unidade). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0034_unit_invites.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  mgr uuid := gen_random_uuid();
  cook uuid := gen_random_uuid();
  cook2 uuid := gen_random_uuid();
  rt2 uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; ub uuid; inv uuid; got uuid; ok boolean;
  h1 text := repeat('a', 64); h2 text := repeat('b', 64); h3 text := repeat('c', 64);
  h4 text := repeat('d', 64); h5 text := repeat('e', 64); h6 text := repeat('f', 64);
begin
  insert into directus_users (id, email) values
    (owner, 'inv-owner@example.com'), (mgr, 'inv-mgr@example.com'), (cook, 'inv-cook@example.com'),
    (cook2, 'inv-cook2@example.com'), (rt2, 'inv-rt2@example.com'), (outsider, 'inv-out@example.com');
  o1 := create_organization(owner, 'Cozinha Convites', 'company', null, '1', 'CRN-9');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade B') returning id into ub;

  -- owner convida gestor; organização vem da unidade; validade limitada a 7 dias
  insert into unit_invites (organization_id, unit_id, role, token_hash, expires_at, user_created)
    values (gen_random_uuid(), ua, 'manager', h1, now() + interval '30 days', owner) returning id into inv;
  assert (select organization_id from unit_invites where id = inv) = o1.id, 'organização da unidade';
  assert (select expires_at <= now() + interval '7 days 1 minute' from unit_invites where id = inv), 'no máximo 7 dias';

  got := unit_invite_accept(h1, mgr);
  assert got = ua, 'aceite devolve a unidade';
  assert has_unit_role(ua, mgr, '{manager}'), 'gestor entrou em A';
  assert not has_unit_role(ub, mgr), 'gestor não entra em B';
  assert not exists (select 1 from organization_members where user_id = mgr), 'fora de organization_members';
  assert unit_invite_accept(h1, cook) is null, 'uso único';

  -- gestor convida cozinheiro, mas não RT nem gestor
  insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'cook', h2, now() + interval '7 days', mgr);
  ok := false; begin insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'technical_lead', h3, now() + interval '7 days', mgr);
  exception when raise_exception then ok := true; end; assert ok, 'gestor não convida RT';
  ok := false; begin insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ub, 'cook', h3, now() + interval '7 days', mgr);
  exception when raise_exception then ok := true; end; assert ok, 'gestor de A não convida para B';
  ok := false; begin insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'cook', h3, now() + interval '7 days', outsider);
  exception when raise_exception then ok := true; end; assert ok, 'estranho não convida';
  assert unit_invite_accept(h2, cook) = ua, 'cozinheiro aceitou';
  assert has_unit_role(ua, cook, '{cook}') and not has_unit_role(ua, cook, '{manager,technical_lead}'), 'só cozinheiro';

  -- revogado e vencido não servem; revogado não pode ser usado depois
  insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'cook', h3, now() + interval '7 days', owner) returning id into inv;
  update unit_invites set revoked_at = now() where id = inv;
  assert unit_invite_accept(h3, cook2) is null, 'revogado';
  ok := false; begin update unit_invites set used_at = now() where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'revogado não vira usado';
  ok := false; begin update unit_invites set role = 'manager' where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'convite imutável';
  insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'cook', h4, now() + interval '7 days', owner) returning id into inv;
  alter table unit_invites disable trigger unit_invites_guard;
  update unit_invites set expires_at = now() - interval '1 minute' where id = inv;
  alter table unit_invites enable trigger unit_invites_guard;
  assert unit_invite_accept(h4, cook2) is null, 'vencido';

  -- um RT por unidade
  insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'technical_lead', h5, now() + interval '7 days', owner);
  insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ua, 'technical_lead', h6, now() + interval '7 days', owner);
  assert unit_invite_accept(h5, owner) = ua, 'owner pode ser RT';
  ok := false; begin perform unit_invite_accept(h6, rt2);
  exception when raise_exception then ok := true; end; assert ok, 'segundo RT recusado';
  assert (select used_at is null from unit_invites where token_hash = h6), 'convite do segundo RT continua pendente';

  -- unidade inativa não recebe nem aceita convite
  update production_units set active = false where id = ub;
  ok := false; begin insert into unit_invites (unit_id, role, token_hash, expires_at, user_created) values (ub, 'cook', repeat('1', 64), now() + interval '7 days', owner);
  exception when raise_exception then ok := true; end; assert ok, 'unidade inativa';

  -- auditoria da equipe e dos convites
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'unit_members' and entity_id = cook::text and action = 'insert'), 'entrada auditada';
  delete from unit_members where unit_id = ua and user_id = cook;
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'unit_members' and entity_id = cook::text and action = 'delete'), 'saída auditada';
  assert exists (select 1 from audit_logs where organization_id = o1.id and entity = 'unit_invites' and action = 'insert'), 'convite auditado';

  -- apagar a organização leva os convites
  delete from organizations where id = o1.id;
  assert not exists (select 1 from unit_invites where organization_id = o1.id), 'convites em cascata';
end $$;

rollback;
