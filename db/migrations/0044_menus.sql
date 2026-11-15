-- U2c — Cardápio cíclico (RN-135, RN-136) e fluxo de aprovação (RN-224). Idempotente.
--
-- Decisões:
-- - Ciclo por unidade: duração em dias (7 a 56), data de início, serviços (desjejum … ceia) e posições do
--   prato (principal, acompanhamento, guarnição, salada, sobremesa, bebida…), iguais para todos os serviços.
-- - Cada posição aponta para a RAIZ da ficha técnica (sheet_root_id): o cardápio usa sempre a versão
--   aprovada mais recente (RN-134).
-- - Fluxo: rascunho → enviado → aprovado. Mudar item de cardápio enviado ou aprovado volta para rascunho e
--   fica no histórico (menu_approvals). O envio acima do teto de custo exige justificativa (conferido no
--   endpoint, que calcula o custo pelas fichas aprovadas).
-- - Dia do ciclo numa data: menu_day_index(ciclo, data) = ((data − início) mod duração) + 1.

begin;

create table if not exists menu_cycles (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations (id) on delete cascade,
  unit_id            uuid not null references production_units (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 2 and 120),
  starts_on          date not null,
  length_days        integer not null default 28 check (length_days between 7 and 56),
  services           text[] not null default '{lunch}'
                       check (cardinality(services) between 1 and 6 and services <@ '{breakfast,morning_snack,lunch,afternoon_snack,dinner,supper}'),
  slots              text[] not null default '{main,side,garnish,salad,dessert,beverage}'
                       check (cardinality(slots) between 1 and 10 and slots <@ '{main,side,garnish,salad,soup,dessert,bread,beverage,sauce,other}'),
  cost_target_cents  integer check (cost_target_cents is null or cost_target_cents between 1 and 1000000),
  status             text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  justification      text check (justification is null or char_length(justification) <= 1000),
  submitted_at       timestamptz,
  approved_by        uuid references directus_users (id) on delete set null,
  approved_at        timestamptz,
  created_by         uuid references directus_users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);
create index if not exists menu_cycles_unit on menu_cycles (unit_id, status, starts_on desc);

create table if not exists menu_items (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references menu_cycles (id) on delete cascade,
  day_index      integer not null check (day_index between 1 and 56),
  service        text not null check (service in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')),
  slot           text not null check (slot in ('main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'other')),
  sheet_root_id  uuid not null references tech_sheets (id) on delete cascade,
  unique (cycle_id, day_index, service, slot)
);

create table if not exists menu_approvals (
  id         bigserial primary key,
  cycle_id   uuid not null references menu_cycles (id) on delete cascade,
  action     text not null check (action in ('submitted', 'approved', 'returned', 'reopened')),
  note       text check (note is null or char_length(note) <= 1000),
  cost_check jsonb,
  user_id    uuid references directus_users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists menu_approvals_cycle on menu_approvals (cycle_id, created_at desc);

/** Dia do ciclo (1 … duração) numa data; null antes do início. */
create or replace function menu_day_index(p_cycle uuid, p_date date) returns integer
language sql stable as $$
  select case when p_date < c.starts_on then null else ((p_date - c.starts_on) % c.length_days) + 1 end
    from menu_cycles c where c.id = p_cycle;
$$;

-- Ciclo: organização vem da unidade; status só pelas funções; mudar dados de enviado/aprovado reabre.
create or replace function menu_cycles_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.status := 'draft'; new.submitted_at := null; new.approved_at := null; new.approved_by := null;
    return new;
  end if;
  if new.unit_id <> old.unit_id or new.organization_id <> old.organization_id then
    raise exception 'O cardápio não muda de unidade' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status and current_setting('rafanutri.menu_flow', true) is distinct from 'on' then
    raise exception 'Use o fluxo de aprovação para mudar a situação do cardápio' using errcode = 'P0001';
  end if;
  if current_setting('rafanutri.menu_flow', true) is distinct from 'on' and old.status <> 'draft'
     and (new.name, new.starts_on, new.length_days, new.services, new.slots, new.cost_target_cents)
         is distinct from (old.name, old.starts_on, old.length_days, old.services, old.slots, old.cost_target_cents) then
    new.status := 'draft'; new.approved_at := null; new.approved_by := null;
    insert into menu_approvals (cycle_id, action, note, user_id) values (old.id, 'reopened', 'Dados do ciclo alterados', audit_actor());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists menu_cycles_guard on menu_cycles;
create trigger menu_cycles_guard before insert or update on menu_cycles for each row execute function menu_cycles_guard();

-- Itens: dia, serviço e posição do ciclo; ficha aprovada da mesma empresa; mudar enviado/aprovado reabre.
create or replace function menu_items_guard() returns trigger language plpgsql as $$
declare c menu_cycles; r menu_items := coalesce(new, old);
begin
  select * into c from menu_cycles where id = r.cycle_id;
  if c.id is null then return coalesce(new, old); end if; -- ciclo sendo apagado
  if tg_op = 'DELETE' and not exists (select 1 from organizations where id = c.organization_id) then return old; end if;
  if tg_op <> 'DELETE' then
    if new.day_index > c.length_days or not (new.service = any (c.services)) or not (new.slot = any (c.slots)) then
      raise exception 'Dia, serviço ou posição fora do ciclo' using errcode = 'P0001';
    end if;
    if not exists (select 1 from tech_sheets where id = new.sheet_root_id and root_id = id and organization_id = c.organization_id)
       or not exists (select 1 from tech_sheets where root_id = new.sheet_root_id and status = 'approved') then
      raise exception 'Use uma ficha técnica aprovada da empresa' using errcode = 'P0001';
    end if;
  end if;
  if c.status <> 'draft' then
    perform set_config('rafanutri.menu_flow', 'on', true);
    update menu_cycles set status = 'draft', approved_at = null, approved_by = null where id = c.id;
    perform set_config('rafanutri.menu_flow', 'off', true);
    insert into menu_approvals (cycle_id, action, note, user_id) values (c.id, 'reopened', 'Cardápio alterado depois de ' || case c.status when 'approved' then 'aprovado' else 'enviado' end, audit_actor());
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists menu_items_guard on menu_items;
create trigger menu_items_guard before insert or update or delete on menu_items for each row execute function menu_items_guard();

/** Muda a situação: submit (rascunho → enviado), approve (enviado → aprovado), return (enviado → rascunho). */
create or replace function menu_transition(p_cycle uuid, p_user uuid, p_action text, p_note text default null, p_cost_check jsonb default null)
returns menu_cycles language plpgsql security definer set search_path = public as $$
declare c menu_cycles; next text;
begin
  select * into c from menu_cycles where id = p_cycle for update;
  if c.id is null then raise exception 'Cardápio não encontrado' using errcode = 'P0001'; end if;
  next := case
    when p_action = 'submit' and c.status = 'draft' then 'submitted'
    when p_action = 'approve' and c.status = 'submitted' then 'approved'
    when p_action = 'return' and c.status = 'submitted' then 'draft'
  end;
  if next is null then raise exception 'Ação não permitida na situação atual do cardápio' using errcode = 'P0001'; end if;
  if p_action = 'submit' and not exists (select 1 from menu_items where cycle_id = c.id) then
    raise exception 'Preencha o cardápio antes de enviar' using errcode = 'P0001';
  end if;
  if p_action = 'return' and nullif(btrim(p_note), '') is null then
    raise exception 'Diga o que precisa mudar' using errcode = 'P0001';
  end if;
  perform set_config('rafanutri.menu_flow', 'on', true);
  update menu_cycles set status = next,
         submitted_at = case when p_action = 'submit' then now() else submitted_at end,
         justification = case when p_action = 'submit' then nullif(btrim(p_note), '') else justification end,
         approved_by = case when p_action = 'approve' then p_user else null end,
         approved_at = case when p_action = 'approve' then now() else null end
   where id = c.id returning * into c;
  perform set_config('rafanutri.menu_flow', 'off', true);
  insert into menu_approvals (cycle_id, action, note, cost_check, user_id)
  values (c.id, case p_action when 'submit' then 'submitted' when 'approve' then 'approved' else 'returned' end, nullif(btrim(p_note), ''), p_cost_check, p_user);
  return c;
end $$;

drop trigger if exists menu_cycles_audit on menu_cycles;
create trigger menu_cycles_audit after insert or update or delete on menu_cycles for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0044_menus') on conflict do nothing;

commit;
