-- Fotos que faltavam: preparação na ficha técnica (RN-129) e recusa no recebimento (RN-141). Idempotente.
--
-- Decisões:
-- - Foto da ficha muda a qualquer momento (não entra no cálculo nem na aprovação).
-- - Foto da recusa fica no item recebido e na não conformidade aberta pela recusa.
-- - Correção: ficha aprovada recusava o "set null" das FKs (conta, ficha mãe ou foto apagada); agora a FK
--   pode zerar a referência (só pela ação da FK).

begin;

alter table tech_sheets add column if not exists photo uuid references directus_files (id) on delete set null;
alter table goods_receipt_items add column if not exists photo uuid references directus_files (id) on delete set null;

create or replace function tech_sheets_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.root_id := coalesce(new.root_id, new.id);
    if new.status <> 'draft' and current_setting('rafanutri.sheet_approve', true) is distinct from 'on' then
      new.status := 'draft';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from organizations where id = old.organization_id) then
      raise exception 'Só rascunho pode ser apagado; arquive a ficha aprovada' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.organization_id <> old.organization_id or new.root_id is distinct from old.root_id or new.version <> old.version then
    raise exception 'A ficha não muda de empresa nem de versão' using errcode = 'P0001';
  end if;
  -- FK set null (conta, ficha mãe ou foto apagada), só pela ação da FK
  if pg_trigger_depth() > 1
     and (to_jsonb(new) - 'approved_by' - 'created_by' - 'parent_id' - 'photo') = (to_jsonb(old) - 'approved_by' - 'created_by' - 'parent_id' - 'photo') then
    return new;
  end if;
  -- foto da preparação muda em qualquer situação
  if (to_jsonb(new) - 'photo' - 'updated_at') = (to_jsonb(old) - 'photo' - 'updated_at') and new.photo is distinct from old.photo then
    new.updated_at := now();
    return new;
  end if;
  if old.status = 'approved' then
    if new.status = 'archived' and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
      new.updated_at := now();
      return new;
    end if;
    raise exception 'Ficha aprovada não se altera; crie uma nova versão' using errcode = 'P0001';
  end if;
  if old.status = 'archived' then raise exception 'Ficha arquivada não se altera' using errcode = 'P0001'; end if;
  if new.status = 'approved' and current_setting('rafanutri.sheet_approve', true) is distinct from 'on' then
    raise exception 'Use tech_sheet_approve para aprovar' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Itens recebidos: FK set null também da foto.
create or replace function goods_receipts_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then return old; end if;
  -- referências zeradas por FK (on delete set null) passam
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'lot_id' - 'non_conformity_id' - 'order_id' - 'supplier_id' - 'received_by' - 'photo')
                        = (to_jsonb(old) - 'lot_id' - 'non_conformity_id' - 'order_id' - 'supplier_id' - 'received_by' - 'photo') then
    return new;
  end if;
  if current_setting('rafanutri.receive', true) is distinct from 'on' then
    raise exception 'Use o recebimento do pedido' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Recebimento (a de 0047) gravando a foto da recusa no item e na não conformidade.
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
      insert into non_conformities (organization_id, unit_id, source, title, description, severity, opened_by, photo)
      values (o.organization_id, o.unit_id, 'receiving', left('Recebimento recusado: ' || ing.name, 500),
              left(concat_ws(E'\n', it ->> 'reject_reason', case when (it ->> 'temperature') is not null then 'Temperatura na chegada: ' || (it ->> 'temperature') || ' °C' end), 2000),
              'high', p_user, nullif(it ->> 'photo', '')::uuid) returning id into nc;
    end if;
    insert into goods_receipt_items (receipt_id, ingredient_id, quantity_units, accepted, lot_code, expires_on, temperature, unit_price_cents, reject_reason, lot_id, non_conformity_id, photo)
    values (r, ing.id, qty, coalesce((it ->> 'accepted')::boolean, false), nullif(btrim(it ->> 'lot_code'), ''), nullif(it ->> 'expires_on', '')::date,
            (it ->> 'temperature')::numeric, (it ->> 'unit_price_cents')::integer, nullif(btrim(it ->> 'reject_reason'), ''), lot, nc, nullif(it ->> 'photo', '')::uuid);
  end loop;
  update purchase_orders set status = 'received', received_at = now() where id = o.id;
  perform set_config('rafanutri.receive', 'off', true);
  return r;
end $$;

insert into schema_migrations (version) values ('0055_photos') on conflict do nothing;

commit;
