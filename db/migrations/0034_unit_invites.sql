-- RN-220 — Convite da equipe da unidade por link (uso único, 7 dias, revogável, sem e-mail).
-- Idempotente.
--
-- Decisões:
-- - O link leva só o papel na unidade: quem aceita entra em unit_members, nunca em organization_members.
-- - O owner convida para qualquer papel; gestor e RT da unidade convidam cozinheiro, estoquista e auditor.
-- - Aceitar é uma função (unit_invite_accept) que trava o convite, grava o papel e marca o uso na mesma transação.
-- - Mudanças na equipe (unit_members) entram na trilha de auditoria da organização.

begin;

create table if not exists unit_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  role            text not null check (role in ('technical_lead', 'manager', 'cook', 'stock_keeper', 'auditor')),
  label           text check (label is null or char_length(label) between 1 and 120),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  used_by         uuid references directus_users (id) on delete set null,
  revoked_at      timestamptz,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now()
);
create index if not exists unit_invites_unit on unit_invites (unit_id, date_created desc);

create or replace function unit_invites_guard() returns trigger language plpgsql as $$
declare u production_units;
begin
  if tg_op = 'INSERT' then
    select * into u from production_units where id = new.unit_id;
    if u.id is null or not u.active then
      raise exception 'Só unidades ativas recebem convite' using errcode = 'P0001';
    end if;
    if not org_has_module(u.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.organization_id := u.organization_id;
    if new.user_created is null or not (
      exists (select 1 from organization_members where organization_id = u.organization_id and user_id = new.user_created and role = 'owner')
      or (new.role in ('cook', 'stock_keeper', 'auditor')
          and exists (select 1 from unit_members where unit_id = u.id and user_id = new.user_created and role in ('manager', 'technical_lead')))
    ) then
      raise exception 'Sem permissão para convidar com este papel' using errcode = 'P0001';
    end if;
    if (select count(*) from unit_invites where unit_id = u.id and used_at is null and revoked_at is null and expires_at > now()) >= 30 then
      raise exception 'Muitos convites pendentes nesta unidade; cancele algum antes' using errcode = 'P0001';
    end if;
    new.used_at := null; new.used_by := null; new.revoked_at := null;
    new.date_created := now();
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '7 days');
    return new;
  end if;
  -- UPDATE: só marcar uso ou revogação, uma vez
  if new.organization_id <> old.organization_id or new.unit_id <> old.unit_id or new.role <> old.role
     or new.label is distinct from old.label or new.token_hash <> old.token_hash or new.expires_at <> old.expires_at
     or new.date_created <> old.date_created or new.user_created is distinct from old.user_created then
    raise exception 'O convite não pode ser alterado' using errcode = 'P0001';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Convite já usado ou revogado' using errcode = 'P0001';
  end if;
  if new.used_at is not null and new.revoked_at is not null and old.used_at is null then
    raise exception 'Convite revogado não pode ser usado' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists unit_invites_guard on unit_invites;
create trigger unit_invites_guard before insert or update on unit_invites
  for each row execute function unit_invites_guard();

drop trigger if exists unit_invites_audit on unit_invites;
create trigger unit_invites_audit after insert or update or delete on unit_invites
  for each row execute function audit_trigger();

/**
 * Aceita o convite pelo hash do token. Devolve a unidade; null se o convite não existe, venceu,
 * já foi usado, foi revogado ou a unidade está inativa. Unidade que já tem RT: exceção P0001.
 */
create or replace function unit_invite_accept(p_hash text, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv unit_invites;
begin
  select i.* into inv from unit_invites i join production_units u on u.id = i.unit_id
   where i.token_hash = p_hash and i.used_at is null and i.revoked_at is null and i.expires_at > now() and u.active
   for update of i;
  if inv.id is null or p_user is null then return null; end if;
  if inv.role = 'technical_lead' and exists (
    select 1 from unit_members where unit_id = inv.unit_id and role = 'technical_lead' and user_id <> p_user
  ) then
    raise exception 'Esta unidade já tem um RT. Peça um novo convite com outro papel.' using errcode = 'P0001';
  end if;
  insert into unit_members (unit_id, user_id, role) values (inv.unit_id, p_user, inv.role) on conflict do nothing;
  update unit_invites set used_at = now(), used_by = p_user where id = inv.id;
  return inv.unit_id;
end $$;

-- Auditoria da equipe: unit_members não tem organization_id; resolve pela unidade.
create or replace function unit_members_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare r unit_members; org uuid; fields text[];
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  select organization_id into org from production_units where id = r.unit_id;
  if org is null then return null; end if; -- unidade sendo apagada (cascata)
  if tg_op = 'UPDATE' then
    if new.role = old.role and new.user_id = old.user_id then return null; end if;
    fields := array['role'];
  end if;
  perform audit_write(org, audit_actor(), lower(tg_op), 'unit_members', r.user_id::text, null, fields);
  return null;
end $$;
drop trigger if exists unit_members_audit on unit_members;
create trigger unit_members_audit after insert or update or delete on unit_members
  for each row execute function unit_members_audit();

insert into schema_migrations (version) values ('0034_unit_invites') on conflict do nothing;

commit;
