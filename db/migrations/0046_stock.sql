-- U4a — Estoque por lote com FEFO (RN-142, RN-143), inventário (RN-144) e base dos alertas (RN-145). Idempotente.
--
-- Decisões:
-- - Quantidades em gramas (a tela converte para a unidade de compra do insumo).
-- - Lote: insumo, código, validade, saldo, custo por kg (opcional), fornecedor. Saldo nunca negativo.
-- - Todo movimento passa por funções transacionais que travam os lotes (FOR UPDATE):
--     stock_receive  → cria o lote e o movimento 'in';
--     stock_out_fefo → consome os lotes pela validade mais próxima (FEFO) e falha se faltar saldo;
--     inventory_approve → ajustes ('adjustment') a partir da contagem, com motivo.
--   Direto por INSERT/UPDATE o banco recusa (rafanutri.stock_fn).
-- - Inventário: contagem cega (o sistema guarda o saldo no momento da abertura); aprovação pelo RT ou owner.

begin;

create table if not exists stock_lots (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  ingredient_id   uuid not null references ingredients (id) on delete cascade,
  lot_code        text check (lot_code is null or char_length(lot_code) <= 60),
  expires_on      date,
  quantity_g      numeric(14, 1) not null default 0 check (quantity_g >= 0),
  cost_per_kg_cents integer check (cost_per_kg_cents is null or cost_per_kg_cents between 0 and 100000000),
  supplier_id     uuid references suppliers (id) on delete set null,
  received_at     timestamptz not null default now(),
  created_by      uuid references directus_users (id) on delete set null
);
create index if not exists stock_lots_fefo on stock_lots (unit_id, ingredient_id, expires_on nulls last, received_at) where quantity_g > 0;

create table if not exists stock_movements (
  id              bigserial primary key,
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  ingredient_id   uuid not null references ingredients (id) on delete cascade,
  lot_id          uuid references stock_lots (id) on delete cascade,
  kind            text not null check (kind in ('in', 'out_production', 'out_loss', 'adjustment')),
  quantity_g      numeric(14, 1) not null check (quantity_g <> 0),
  reason          text check (reason is null or char_length(reason) <= 300),
  ref_id          uuid,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists stock_movements_unit on stock_movements (unit_id, created_at desc);

create table if not exists inventories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  status          text not null default 'open' check (status in ('open', 'approved', 'cancelled')),
  notes           text check (notes is null or char_length(notes) <= 500),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  approved_by     uuid references directus_users (id) on delete set null,
  approved_at     timestamptz
);
create unique index if not exists inventories_one_open on inventories (unit_id) where status = 'open';

create table if not exists inventory_counts (
  inventory_id  uuid not null references inventories (id) on delete cascade,
  ingredient_id uuid not null references ingredients (id) on delete cascade,
  system_g      numeric(14, 1) not null,
  counted_g     numeric(14, 1) check (counted_g is null or counted_g >= 0),
  reason        text check (reason is null or char_length(reason) <= 300),
  counted_by    uuid references directus_users (id) on delete set null,
  primary key (inventory_id, ingredient_id)
);

-- Lotes e movimentos só pelas funções.
create or replace function stock_fn_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from production_units where id = old.unit_id) or not exists (select 1 from ingredients where id = old.ingredient_id) then return old; end if;
  end if;
  if current_setting('rafanutri.stock_fn', true) is distinct from 'on' then
    raise exception 'Use as operações de estoque (entrada, saída, inventário)' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists stock_lots_guard on stock_lots;
create trigger stock_lots_guard before insert or update or delete on stock_lots for each row execute function stock_fn_guard();
drop trigger if exists stock_movements_guard on stock_movements;
create trigger stock_movements_guard before insert or update or delete on stock_movements for each row execute function stock_fn_guard();

/** Entrada: cria o lote e o movimento 'in'. Devolve o lote. */
create or replace function stock_receive(p_unit uuid, p_ingredient uuid, p_qty_g numeric, p_lot text, p_expires date,
                                         p_supplier uuid, p_cost_per_kg integer, p_user uuid, p_ref uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare u production_units; lot uuid;
begin
  select * into u from production_units where id = p_unit;
  if u.id is null or not u.active then raise exception 'Unidade indisponível' using errcode = 'P0001'; end if;
  if not exists (select 1 from ingredients where id = p_ingredient and organization_id = u.organization_id) then
    raise exception 'Insumo de outra empresa' using errcode = 'P0001';
  end if;
  if p_supplier is not null and not exists (select 1 from suppliers where id = p_supplier and organization_id = u.organization_id) then
    raise exception 'Fornecedor de outra empresa' using errcode = 'P0001';
  end if;
  if p_qty_g is null or p_qty_g <= 0 then raise exception 'Quantidade inválida' using errcode = 'P0001'; end if;
  perform set_config('rafanutri.stock_fn', 'on', true);
  insert into stock_lots (organization_id, unit_id, ingredient_id, lot_code, expires_on, quantity_g, cost_per_kg_cents, supplier_id, created_by)
  values (u.organization_id, u.id, p_ingredient, nullif(btrim(p_lot), ''), p_expires, p_qty_g, p_cost_per_kg, p_supplier, p_user) returning id into lot;
  insert into stock_movements (organization_id, unit_id, ingredient_id, lot_id, kind, quantity_g, ref_id, created_by)
  values (u.organization_id, u.id, p_ingredient, lot, 'in', p_qty_g, p_ref, p_user);
  perform set_config('rafanutri.stock_fn', 'off', true);
  return lot;
end $$;

/**
 * Saída pela validade mais próxima (FEFO; sem validade por último; empate pela entrada mais antiga).
 * Falha sem mexer em nada se o saldo não basta. Devolve quantos lotes foram usados.
 */
create or replace function stock_out_fefo(p_unit uuid, p_ingredient uuid, p_qty_g numeric, p_kind text, p_reason text, p_user uuid, p_ref uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare l stock_lots; remaining numeric := p_qty_g; take numeric; used integer := 0; available numeric;
begin
  if p_kind not in ('out_production', 'out_loss', 'adjustment') then raise exception 'Tipo de saída inválido' using errcode = 'P0001'; end if;
  if p_qty_g is null or p_qty_g <= 0 then raise exception 'Quantidade inválida' using errcode = 'P0001'; end if;
  if p_kind = 'out_loss' and nullif(btrim(p_reason), '') is null then raise exception 'Informe o motivo da perda' using errcode = 'P0001'; end if;
  -- trava todos os lotes do insumo na unidade (evita duas saídas simultâneas furarem o saldo)
  select coalesce(sum(quantity_g), 0) into available from (
    select quantity_g from stock_lots where unit_id = p_unit and ingredient_id = p_ingredient and quantity_g > 0 for update) s;
  if available < p_qty_g then
    raise exception 'Saldo insuficiente: há % g e a saída pede % g', available, p_qty_g using errcode = 'P0001';
  end if;
  perform set_config('rafanutri.stock_fn', 'on', true);
  for l in select * from stock_lots where unit_id = p_unit and ingredient_id = p_ingredient and quantity_g > 0
           order by expires_on nulls last, received_at, id loop
    exit when remaining <= 0;
    take := least(l.quantity_g, remaining);
    update stock_lots set quantity_g = quantity_g - take where id = l.id;
    insert into stock_movements (organization_id, unit_id, ingredient_id, lot_id, kind, quantity_g, reason, ref_id, created_by)
    values (l.organization_id, l.unit_id, l.ingredient_id, l.id, p_kind, -take, nullif(btrim(p_reason), ''), p_ref, p_user);
    remaining := remaining - take;
    used := used + 1;
  end loop;
  perform set_config('rafanutri.stock_fn', 'off', true);
  return used;
end $$;

/** Abre o inventário da unidade com o saldo atual de cada insumo ativo (ou com saldo). */
create or replace function inventory_open(p_unit uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare u production_units; inv uuid;
begin
  select * into u from production_units where id = p_unit;
  if u.id is null or not u.active then raise exception 'Unidade indisponível' using errcode = 'P0001'; end if;
  if exists (select 1 from inventories where unit_id = p_unit and status = 'open') then
    raise exception 'Já existe um inventário aberto nesta unidade' using errcode = 'P0001';
  end if;
  insert into inventories (organization_id, unit_id, created_by) values (u.organization_id, u.id, p_user) returning id into inv;
  insert into inventory_counts (inventory_id, ingredient_id, system_g)
  select inv, i.id, coalesce((select sum(quantity_g) from stock_lots l where l.unit_id = u.id and l.ingredient_id = i.id), 0)
    from ingredients i
   where i.organization_id = u.organization_id
     and (i.active or exists (select 1 from stock_lots l where l.unit_id = u.id and l.ingredient_id = i.id and l.quantity_g > 0));
  return inv;
end $$;

/**
 * Aprova o inventário (RT da unidade ou owner): para cada insumo contado com diferença, ajusta o estoque.
 * Falta: saída FEFO 'adjustment'; sobra: entra num lote de ajuste. Diferença exige motivo.
 */
create or replace function inventory_approve(p_inventory uuid, p_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare inv inventories; c inventory_counts; diff numeric; current_g numeric; n integer := 0;
begin
  select * into inv from inventories where id = p_inventory for update;
  if inv.id is null or inv.status <> 'open' then raise exception 'Inventário não está aberto' using errcode = 'P0001'; end if;
  if not exists (select 1 from organization_members where organization_id = inv.organization_id and user_id = p_user and role = 'owner')
     and not exists (select 1 from unit_members where unit_id = inv.unit_id and user_id = p_user and role = 'technical_lead') then
    raise exception 'Só o RT da unidade ou o responsável pela empresa aprovam o inventário' using errcode = 'P0001';
  end if;
  for c in select * from inventory_counts where inventory_id = inv.id and counted_g is not null loop
    select coalesce(sum(quantity_g), 0) into current_g from stock_lots where unit_id = inv.unit_id and ingredient_id = c.ingredient_id;
    diff := c.counted_g - current_g;
    continue when diff = 0;
    if nullif(btrim(c.reason), '') is null then
      raise exception 'Informe o motivo das divergências antes de aprovar' using errcode = 'P0001';
    end if;
    if diff < 0 then
      perform stock_out_fefo(inv.unit_id, c.ingredient_id, -diff, 'adjustment', 'Inventário: ' || c.reason, p_user, inv.id);
    else
      perform set_config('rafanutri.stock_fn', 'on', true);
      with lot as (
        insert into stock_lots (organization_id, unit_id, ingredient_id, lot_code, quantity_g, created_by)
        values (inv.organization_id, inv.unit_id, c.ingredient_id, 'AJUSTE', diff, p_user) returning id
      )
      insert into stock_movements (organization_id, unit_id, ingredient_id, lot_id, kind, quantity_g, reason, ref_id, created_by)
      select inv.organization_id, inv.unit_id, c.ingredient_id, lot.id, 'adjustment', diff, 'Inventário: ' || c.reason, inv.id, p_user from lot;
      perform set_config('rafanutri.stock_fn', 'off', true);
    end if;
    n := n + 1;
  end loop;
  update inventories set status = 'approved', approved_by = p_user, approved_at = now() where id = inv.id;
  return n;
end $$;

/** Saldo por unidade e insumo, com a validade mais próxima entre os lotes com saldo. */
create or replace view stock_balance as
  select l.unit_id, l.ingredient_id, sum(l.quantity_g) as quantity_g,
         min(l.expires_on) filter (where l.quantity_g > 0) as next_expiry,
         count(*) filter (where l.quantity_g > 0) as lots
    from stock_lots l group by l.unit_id, l.ingredient_id;

drop trigger if exists inventories_audit on inventories;
create trigger inventories_audit after insert or update or delete on inventories for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0046_stock') on conflict do nothing;

commit;
