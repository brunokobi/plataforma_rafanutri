-- U4b — Pedido de compra (RN-140) e recebimento de mercadorias (RN-141). Idempotente.
--
-- Decisões:
-- - Pedido por unidade e fornecedor: rascunho → enviado → recebido (ou cancelado). Itens na unidade de compra
--   do insumo, com o preço vigente no momento (editável no rascunho).
-- - Recebimento (goods_receipts + itens) só pela função receive_order: para cada item aceito cria o lote no
--   estoque (stock_receive, origem = recebimento) e registra o preço pago (ingredient_prices, source
--   'receiving'); item recusado exige motivo e abre não conformidade de origem 'receiving'.
-- - Temperatura de chegada por item (refrigerado/congelado), registrada para o histórico.

begin;

create table if not exists purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  supplier_id     uuid references suppliers (id) on delete set null,
  status          text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  expected_on     date,
  notes           text check (notes is null or char_length(notes) <= 1000),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  received_at     timestamptz
);
create index if not exists purchase_orders_unit on purchase_orders (unit_id, status, created_at desc);

create table if not exists purchase_order_items (
  order_id         uuid not null references purchase_orders (id) on delete cascade,
  ingredient_id    uuid not null references ingredients (id) on delete cascade,
  quantity_units   numeric(12, 2) not null check (quantity_units > 0),
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents between 0 and 100000000),
  received_units   numeric(12, 2) not null default 0 check (received_units >= 0),
  primary key (order_id, ingredient_id)
);

create table if not exists goods_receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  order_id        uuid references purchase_orders (id) on delete set null,
  supplier_id     uuid references suppliers (id) on delete set null,
  invoice_number  text check (invoice_number is null or char_length(invoice_number) <= 60),
  notes           text check (notes is null or char_length(notes) <= 1000),
  received_by     uuid references directus_users (id) on delete set null,
  received_at     timestamptz not null default now()
);

create table if not exists goods_receipt_items (
  receipt_id      uuid not null references goods_receipts (id) on delete cascade,
  ingredient_id   uuid not null references ingredients (id) on delete cascade,
  quantity_units  numeric(12, 2) not null check (quantity_units >= 0),
  accepted        boolean not null,
  lot_code        text check (lot_code is null or char_length(lot_code) <= 60),
  expires_on      date,
  temperature     numeric(5, 1) check (temperature is null or temperature between -60 and 100),
  unit_price_cents integer check (unit_price_cents is null or unit_price_cents between 0 and 100000000),
  reject_reason   text check (reject_reason is null or char_length(reject_reason) <= 500),
  lot_id          uuid references stock_lots (id) on delete set null,
  non_conformity_id uuid references non_conformities (id) on delete set null,
  primary key (receipt_id, ingredient_id),
  check (accepted or reject_reason is not null)
);

-- Pedido: organização vem da unidade; fornecedor da mesma empresa; itens só em rascunho.
create or replace function purchase_orders_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.status := 'draft'; new.sent_at := null; new.received_at := null;
  elsif new.unit_id <> old.unit_id or new.organization_id <> old.organization_id then
    raise exception 'O pedido não muda de unidade' using errcode = 'P0001';
  elsif old.status in ('received', 'cancelled') and current_setting('rafanutri.receive', true) is distinct from 'on' then
    raise exception 'Pedido recebido ou cancelado não se altera' using errcode = 'P0001';
  end if;
  if new.supplier_id is not null and not exists (select 1 from suppliers where id = new.supplier_id and organization_id = new.organization_id) then
    raise exception 'Fornecedor de outra empresa' using errcode = 'P0001';
  end if;
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status = 'draft') then new.sent_at := now(); end if;
  return new;
end $$;
drop trigger if exists purchase_orders_guard on purchase_orders;
create trigger purchase_orders_guard before insert or update on purchase_orders for each row execute function purchase_orders_guard();

create or replace function purchase_order_items_guard() returns trigger language plpgsql as $$
declare o purchase_orders;
begin
  select * into o from purchase_orders where id = coalesce(new.order_id, old.order_id);
  if o.id is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and not exists (select 1 from organizations where id = o.organization_id) then return old; end if;
  if o.status <> 'draft' and current_setting('rafanutri.receive', true) is distinct from 'on' then
    raise exception 'Itens só mudam com o pedido em rascunho' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' and not exists (select 1 from ingredients where id = new.ingredient_id and organization_id = o.organization_id) then
    raise exception 'Insumo de outra empresa' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists purchase_order_items_guard on purchase_order_items;
create trigger purchase_order_items_guard before insert or update or delete on purchase_order_items for each row execute function purchase_order_items_guard();

-- Recebimento só pela função.
create or replace function goods_receipts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  -- referências zeradas por FK (on delete set null) passam
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'lot_id' - 'non_conformity_id' - 'order_id' - 'supplier_id' - 'received_by')
                        = (to_jsonb(old) - 'lot_id' - 'non_conformity_id' - 'order_id' - 'supplier_id' - 'received_by') then
    return new;
  end if;
  if current_setting('rafanutri.receive', true) is distinct from 'on' then
    raise exception 'Use o recebimento do pedido' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists goods_receipts_guard on goods_receipts;
create trigger goods_receipts_guard before insert or update on goods_receipts for each row execute function goods_receipts_guard();
drop trigger if exists goods_receipt_items_guard on goods_receipt_items;
create trigger goods_receipt_items_guard before insert or update on goods_receipt_items for each row execute function goods_receipts_guard();

/**
 * Recebe o pedido enviado. p_items: [{ingredient_id, quantity_units, accepted, lot_code, expires_on, temperature,
 * unit_price_cents, reject_reason}]. Aceitos entram no estoque (gramas pela unidade de compra) e atualizam o preço;
 * recusados abrem não conformidade. Devolve o recebimento.
 */
create or replace function receive_order(p_order uuid, p_user uuid, p_invoice text, p_notes text, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare o purchase_orders; r uuid; it jsonb; ing ingredients; grams numeric; gpu numeric; lot uuid; nc uuid; qty numeric;
begin
  select * into o from purchase_orders where id = p_order for update;
  if o.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0001'; end if;
  if o.status <> 'sent' then raise exception 'Só pedido enviado pode ser recebido' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Confira ao menos um item' using errcode = 'P0001'; end if;
  perform set_config('rafanutri.receive', 'on', true);
  insert into goods_receipts (organization_id, unit_id, order_id, supplier_id, invoice_number, notes, received_by)
  values (o.organization_id, o.unit_id, o.id, o.supplier_id, nullif(btrim(p_invoice), ''), nullif(btrim(p_notes), ''), p_user) returning id into r;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into ing from ingredients where id = (it ->> 'ingredient_id')::uuid and organization_id = o.organization_id;
    if ing.id is null then raise exception 'Insumo de outra empresa' using errcode = 'P0001'; end if;
    qty := coalesce((it ->> 'quantity_units')::numeric, 0);
    gpu := case ing.purchase_unit when 'kg' then 1000 when 'g' then 1 when 'l' then 1000 * coalesce(ing.density_g_ml, 1)
             when 'ml' then coalesce(ing.density_g_ml, 1) when 'un' then ing.unit_weight_g when 'dz' then 12 * ing.unit_weight_g else ing.pack_grams end;
    lot := null; nc := null;
    if coalesce((it ->> 'accepted')::boolean, false) then
      if qty <= 0 then raise exception 'Quantidade recebida inválida para %', ing.name using errcode = 'P0001'; end if;
      grams := qty * gpu;
      lot := stock_receive(o.unit_id, ing.id, grams, it ->> 'lot_code', nullif(it ->> 'expires_on', '')::date, o.supplier_id,
                           case when (it ->> 'unit_price_cents') is null then null else round((it ->> 'unit_price_cents')::numeric * 1000 / gpu)::integer end, p_user, r);
      if (it ->> 'unit_price_cents') is not null then
        insert into ingredient_prices (organization_id, ingredient_id, supplier_id, price_cents, source, created_by)
        values (o.organization_id, ing.id, o.supplier_id, (it ->> 'unit_price_cents')::integer, 'receiving', p_user);
      end if;
      update purchase_order_items set received_units = received_units + qty where order_id = o.id and ingredient_id = ing.id;
    else
      if nullif(btrim(it ->> 'reject_reason'), '') is null then
        raise exception 'Informe o motivo da recusa de %', ing.name using errcode = 'P0001';
      end if;
      insert into non_conformities (organization_id, unit_id, source, title, description, severity, opened_by)
      values (o.organization_id, o.unit_id, 'receiving', left('Recebimento recusado: ' || ing.name, 500),
              left(concat_ws(E'\n', it ->> 'reject_reason', case when (it ->> 'temperature') is not null then 'Temperatura na chegada: ' || (it ->> 'temperature') || ' °C' end), 2000),
              'high', p_user) returning id into nc;
    end if;
    insert into goods_receipt_items (receipt_id, ingredient_id, quantity_units, accepted, lot_code, expires_on, temperature, unit_price_cents, reject_reason, lot_id, non_conformity_id)
    values (r, ing.id, qty, coalesce((it ->> 'accepted')::boolean, false), nullif(btrim(it ->> 'lot_code'), ''), nullif(it ->> 'expires_on', '')::date,
            (it ->> 'temperature')::numeric, (it ->> 'unit_price_cents')::integer, nullif(btrim(it ->> 'reject_reason'), ''), lot, nc);
  end loop;
  update purchase_orders set status = 'received', received_at = now() where id = o.id;
  perform set_config('rafanutri.receive', 'off', true);
  return r;
end $$;

drop trigger if exists purchase_orders_audit on purchase_orders;
create trigger purchase_orders_audit after insert or update or delete on purchase_orders for each row execute function audit_trigger();
drop trigger if exists goods_receipts_audit on goods_receipts;
create trigger goods_receipts_audit after insert or update or delete on goods_receipts for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0047_purchasing') on conflict do nothing;

commit;
