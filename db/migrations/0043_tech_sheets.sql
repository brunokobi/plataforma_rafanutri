-- U2b — Fichas técnicas de preparação (RN-129, RN-131, RN-134). Idempotente.
--
-- Decisões:
-- - Tabelas `tech_sheets*` (não `recipes`, que já é a biblioteca de receitas do consultório clínico).
-- - Item = insumo (peso bruto e FC próprio ou o do insumo) OU sub-receita (peso da preparação pronta usada).
--   Sub-receita em ciclo é recusada pelo banco. As FKs são em cascata só para a empresa poder ser apagada;
--   a API não apaga insumo nem ficha em uso (e ficha aprovada não perde itens: o gatilho recusa).
-- - Rascunho é editável; aprovada é imutável (itens, passos e dados). Editar = nova versão em rascunho
--   (tech_sheet_new_version), com parent_id e o mesmo root_id; a anterior continua intacta.
-- - Aprovar: só o RT de alguma unidade da empresa ou o owner (conferido no endpoint e em tech_sheet_approve).
-- - Os cálculos (PL, rendimento, custo, nutrientes) são feitos em @rafanutri/nutrition-core (techsheet.ts);
--   na aprovação, o resultado fica em `computed` para relatórios.

begin;

create table if not exists tech_sheets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  root_id         uuid,
  parent_id       uuid references tech_sheets (id) on delete set null,
  version         integer not null default 1 check (version >= 1),
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  category        text not null default 'main'
                    check (category in ('main', 'side', 'garnish', 'salad', 'soup', 'dessert', 'bread', 'beverage', 'sauce', 'base', 'other')),
  servings        integer not null default 10 check (servings between 1 and 10000),
  cooked_weight_g numeric(10, 1) check (cooked_weight_g is null or cooked_weight_g > 0),
  cooking_index   numeric(5, 3) check (cooking_index is null or cooking_index between 0.05 and 10),
  prep_minutes    integer check (prep_minutes is null or prep_minutes between 1 and 2880),
  equipment       text check (equipment is null or char_length(equipment) <= 500),
  notes           text check (notes is null or char_length(notes) <= 2000),
  status          text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  computed        jsonb,
  approved_by     uuid references directus_users (id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists tech_sheets_org on tech_sheets (organization_id, status, name);
create index if not exists tech_sheets_root on tech_sheets (root_id, version desc);

create table if not exists tech_sheet_items (
  id            uuid primary key default gen_random_uuid(),
  sheet_id      uuid not null references tech_sheets (id) on delete cascade,
  position      integer not null check (position between 1 and 500),
  ingredient_id uuid references ingredients (id) on delete cascade,
  sub_sheet_id  uuid references tech_sheets (id) on delete cascade,
  gross_g       numeric(10, 1) not null check (gross_g > 0 and gross_g <= 1000000),
  fc            numeric(5, 3) check (fc is null or fc between 1 and 20),
  note          text check (note is null or char_length(note) <= 200),
  unique (sheet_id, position),
  check ((ingredient_id is null) <> (sub_sheet_id is null)),
  check (sub_sheet_id is null or fc is null)
);
create index if not exists tech_sheet_items_sub on tech_sheet_items (sub_sheet_id) where sub_sheet_id is not null;

create table if not exists tech_sheet_steps (
  sheet_id    uuid not null references tech_sheets (id) on delete cascade,
  position    integer not null check (position between 1 and 200),
  text        text not null check (char_length(btrim(text)) between 2 and 1000),
  critical    boolean not null default false,
  target_temp numeric(5, 1) check (target_temp is null or target_temp between -60 and 300),
  primary key (sheet_id, position)
);

-- Ficha: módulo; root_id; aprovada imutável (exceto arquivar); organização fixa.
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
drop trigger if exists tech_sheets_guard on tech_sheets;
create trigger tech_sheets_guard before insert or update or delete on tech_sheets for each row execute function tech_sheets_guard();

-- Itens e passos: só em rascunho; insumo e sub-receita da mesma empresa; sem ciclo.
create or replace function tech_sheet_parts_guard() returns trigger language plpgsql as $$
declare s tech_sheets; sid uuid := case when tg_op = 'DELETE' then old.sheet_id else new.sheet_id end;
begin
  select * into s from tech_sheets where id = sid;
  if s.id is null then return coalesce(new, old); end if; -- ficha sendo apagada (cascata)
  if tg_op = 'DELETE' and not exists (select 1 from organizations where id = s.organization_id) then
    return old; -- empresa sendo apagada (cascata)
  end if;
  if s.status <> 'draft' then
    raise exception 'Ficha aprovada não se altera; crie uma nova versão' using errcode = 'P0001';
  end if;
  if tg_op <> 'DELETE' and tg_table_name = 'tech_sheet_items' then
    if new.ingredient_id is not null and not exists (select 1 from ingredients where id = new.ingredient_id and organization_id = s.organization_id) then
      raise exception 'Insumo de outra empresa' using errcode = 'P0001';
    end if;
    if new.sub_sheet_id is not null then
      if not exists (select 1 from tech_sheets where id = new.sub_sheet_id and organization_id = s.organization_id) then
        raise exception 'Sub-receita de outra empresa' using errcode = 'P0001';
      end if;
      if new.sub_sheet_id = s.id or exists (
        with recursive reach(id) as (
          select new.sub_sheet_id
          union
          select i.sub_sheet_id from tech_sheet_items i join reach r on i.sheet_id = r.id where i.sub_sheet_id is not null
        ) select 1 from reach where id = s.id
      ) then
        raise exception 'Sub-receita em ciclo: esta ficha já é usada pela sub-receita escolhida' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists tech_sheet_items_guard on tech_sheet_items;
create trigger tech_sheet_items_guard before insert or update or delete on tech_sheet_items for each row execute function tech_sheet_parts_guard();
drop trigger if exists tech_sheet_steps_guard on tech_sheet_steps;
create trigger tech_sheet_steps_guard before insert or update or delete on tech_sheet_steps for each row execute function tech_sheet_parts_guard();

/** Aprova o rascunho (só RT de alguma unidade da empresa ou owner); grava o cálculo e arquiva a versão aprovada anterior. */
create or replace function tech_sheet_approve(p_sheet uuid, p_user uuid, p_computed jsonb) returns tech_sheets
language plpgsql security definer set search_path = public as $$
declare s tech_sheets;
begin
  select * into s from tech_sheets where id = p_sheet for update;
  if s.id is null then raise exception 'Ficha não encontrada' using errcode = 'P0001'; end if;
  if s.status <> 'draft' then raise exception 'Só rascunho pode ser aprovado' using errcode = 'P0001'; end if;
  if not exists (select 1 from organization_members where organization_id = s.organization_id and user_id = p_user and role = 'owner')
     and not exists (select 1 from unit_members m join production_units u on u.id = m.unit_id
                     where u.organization_id = s.organization_id and m.user_id = p_user and m.role = 'technical_lead') then
    raise exception 'Só o RT ou o responsável pela empresa aprovam fichas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from tech_sheet_items where sheet_id = s.id) then
    raise exception 'A ficha precisa de ao menos um ingrediente' using errcode = 'P0001';
  end if;
  perform set_config('rafanutri.sheet_approve', 'on', true);
  update tech_sheets set status = 'archived' where root_id = s.root_id and status = 'approved' and id <> s.id;
  update tech_sheets set status = 'approved', approved_by = p_user, approved_at = now(), computed = p_computed where id = s.id returning * into s;
  perform set_config('rafanutri.sheet_approve', 'off', true);
  return s;
end $$;

/** Nova versão em rascunho a partir de uma aprovada (ou arquivada): copia dados, itens e passos. */
create or replace function tech_sheet_new_version(p_sheet uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s tech_sheets; nid uuid; v integer;
begin
  select * into s from tech_sheets where id = p_sheet;
  if s.id is null then raise exception 'Ficha não encontrada' using errcode = 'P0001'; end if;
  if s.status = 'draft' then raise exception 'Esta ficha já é um rascunho editável' using errcode = 'P0001'; end if;
  if exists (select 1 from tech_sheets where root_id = s.root_id and status = 'draft') then
    raise exception 'Já existe um rascunho desta ficha' using errcode = 'P0001';
  end if;
  select max(version) + 1 into v from tech_sheets where root_id = s.root_id;
  insert into tech_sheets (organization_id, root_id, parent_id, version, name, category, servings, cooked_weight_g, cooking_index, prep_minutes, equipment, notes, created_by)
  values (s.organization_id, s.root_id, s.id, v, s.name, s.category, s.servings, s.cooked_weight_g, s.cooking_index, s.prep_minutes, s.equipment, s.notes, p_user)
  returning id into nid;
  insert into tech_sheet_items (sheet_id, position, ingredient_id, sub_sheet_id, gross_g, fc, note)
  select nid, position, ingredient_id, sub_sheet_id, gross_g, fc, note from tech_sheet_items where sheet_id = s.id;
  insert into tech_sheet_steps (sheet_id, position, text, critical, target_temp)
  select nid, position, text, critical, target_temp from tech_sheet_steps where sheet_id = s.id;
  return nid;
end $$;

drop trigger if exists tech_sheets_audit on tech_sheets;
create trigger tech_sheets_audit after insert or update or delete on tech_sheets for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0043_tech_sheets') on conflict do nothing;

commit;
