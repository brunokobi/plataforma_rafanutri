-- U2a — Insumos, fornecedores e histórico de preços (RN-125 a RN-128, alergênicos do RN-222). Idempotente.
--
-- Decisões:
-- - Insumos e fornecedores são da empresa (organização), compartilhados pelas unidades dela.
-- - Unidade de compra fixa (kg, g, L, mL, un, dz, cx, pct) com densidade, peso da unidade e peso da embalagem
--   para converter em gramas (regras em @rafanutri/nutrition-core, units.ts).
-- - Vínculo opcional com a base de alimentos pública (TACO/TBCA) para os nutrientes das fichas técnicas.
-- - FC (fator de correção) padrão do insumo começa em 1; a tabela de referência (hortifrútis e carnes) entra
--   depois de validada com a RT.
-- - Alergênicos pela RDC 26/2015 (+ lactose, RDC 135/2017), por código.
-- - Preço por unidade de compra, com data de vigência; o vigente é o de maior valid_from até a data.

begin;

create or replace function uan_allergen_codes() returns text[] language sql immutable as $$
  select '{gluten,crustaceans,eggs,fish,peanut,soy,milk,lactose,almond,hazelnut,cashew,brazil_nut,macadamia,walnut,pecan,pistachio,pine_nut,chestnut,latex}'::text[];
$$;

create table if not exists ingredients (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations (id) on delete cascade,
  name                    text not null check (char_length(btrim(name)) between 2 and 120),
  category                text not null default 'other'
                            check (category in ('produce', 'meat', 'dairy', 'grains', 'bakery', 'beverages', 'frozen', 'grocery', 'cleaning', 'disposables', 'other')),
  food_id                 integer references foods (id) on delete set null,
  default_fc              numeric(5, 3) not null default 1 check (default_fc between 1 and 20),
  purchase_unit           text not null default 'kg' check (purchase_unit in ('kg', 'g', 'l', 'ml', 'un', 'dz', 'cx', 'pct')),
  density_g_ml            numeric(6, 3) check (density_g_ml is null or density_g_ml between 0.1 and 5),
  unit_weight_g           numeric(9, 2) check (unit_weight_g is null or unit_weight_g > 0),
  pack_grams              numeric(10, 2) check (pack_grams is null or pack_grams > 0),
  storage                 text not null default 'ambient' check (storage in ('ambient', 'chilled', 'frozen')),
  min_stock               numeric(10, 2) check (min_stock is null or min_stock >= 0),
  allergens               text[] not null default '{}',
  active                  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz,
  check (allergens <@ uan_allergen_codes()),
  check (purchase_unit not in ('un', 'dz') or unit_weight_g is not null),
  check (purchase_unit not in ('cx', 'pct') or pack_grams is not null)
);
create unique index if not exists ingredients_org_name on ingredients (organization_id, lower(btrim(name)));
create index if not exists ingredients_org on ingredients (organization_id, active, category);

create table if not exists suppliers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  cnpj            text check (cnpj is null or cnpj ~ '^\d{14}$'),
  contact_name    text check (contact_name is null or char_length(contact_name) <= 120),
  phone           text check (phone is null or char_length(phone) <= 30),
  email           text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  notes           text check (notes is null or char_length(notes) <= 1000),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create unique index if not exists suppliers_org_name on suppliers (organization_id, lower(btrim(name)));

create table if not exists ingredient_prices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  ingredient_id   uuid not null references ingredients (id) on delete cascade,
  supplier_id     uuid references suppliers (id) on delete set null,
  price_cents     integer not null check (price_cents between 1 and 100000000),
  valid_from      date not null default current_date,
  source          text not null default 'manual' check (source in ('manual', 'receiving', 'import')),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists ingredient_prices_ingredient on ingredient_prices (ingredient_id, valid_from desc, created_at desc);

-- Organização: exige o módulo; não muda depois; updated_at.
create or replace function uan_org_row_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'O registro não muda de empresa' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  elsif not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  if tg_table_name = 'ingredients' then
    select array_agg(distinct a order by a) into new.allergens from unnest(new.allergens) a;
    new.allergens := coalesce(new.allergens, '{}');
  end if;
  return new;
end $$;
drop trigger if exists ingredients_guard on ingredients;
create trigger ingredients_guard before insert or update on ingredients for each row execute function uan_org_row_guard();
drop trigger if exists suppliers_guard on suppliers;
create trigger suppliers_guard before insert or update on suppliers for each row execute function uan_org_row_guard();

-- Preço: organização vem do insumo; fornecedor da mesma empresa; não se altera (novo preço = novo registro).
create or replace function ingredient_prices_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- fornecedor apagado (FK on delete set null): só a referência muda
    if old.supplier_id is not null and new.supplier_id is null and (to_jsonb(new) - 'supplier_id') = (to_jsonb(old) - 'supplier_id') then
      return new;
    end if;
    raise exception 'Preço registrado não se altera; registre um novo' using errcode = 'P0001';
  end if;
  new.organization_id := (select organization_id from ingredients where id = new.ingredient_id);
  if new.supplier_id is not null and not exists (select 1 from suppliers where id = new.supplier_id and organization_id = new.organization_id) then
    raise exception 'Fornecedor de outra empresa' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists ingredient_prices_guard on ingredient_prices;
create trigger ingredient_prices_guard before insert or update on ingredient_prices for each row execute function ingredient_prices_guard();

/** Preço vigente do insumo na data (maior valid_from até a data; empate: o último registrado). */
create or replace function ingredient_price_at(p_ingredient uuid, p_date date default current_date)
returns ingredient_prices language sql stable as $$
  select * from ingredient_prices
   where ingredient_id = p_ingredient and valid_from <= p_date
   order by valid_from desc, created_at desc limit 1;
$$;

do $$
declare t text;
begin
  foreach t in array array['ingredients', 'suppliers', 'ingredient_prices'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0042_ingredients') on conflict do nothing;

commit;
