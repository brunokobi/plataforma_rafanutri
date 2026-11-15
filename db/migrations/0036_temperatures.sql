-- RN-151 (e base do RN-152) — Equipamentos e registro de temperatura. Idempotente.
--
-- Decisões:
-- - Cada equipamento tem limites próprios (padrão por tipo, RDC 216/2004; a RT ajusta). A leitura copia os
--   limites vigentes, então mudar o limite depois não muda o histórico.
-- - Leitura fora do limite exige ação corretiva; leituras não se alteram nem se apagam (correção = nova leitura).
-- - Duas leituras seguidas fora do limite no mesmo equipamento abrem uma não conformidade (alta, 72 h),
--   se não houver outra aberta para ele.
-- - Temperatura de alimento (cocção, reaquecimento, distribuição quente e fria, resfriamento) com limites por etapa.
-- - `client_id` único: registro idempotente (preparado para o modo offline).

begin;

create table if not exists equipment (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references organizations (id) on delete cascade,
  unit_id                uuid not null references production_units (id) on delete cascade,
  name                   text not null check (char_length(btrim(name)) between 2 and 80),
  kind                   text not null check (kind in ('refrigerator', 'freezer', 'cold_room', 'freezer_room', 'hot_holding', 'cold_holding', 'other')),
  min_temp               numeric(5, 1) check (min_temp is null or min_temp between -60 and 300),
  max_temp               numeric(5, 1) check (max_temp is null or max_temp between -60 and 300),
  reading_interval_hours integer not null default 8 check (reading_interval_hours between 1 and 168),
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz,
  check (min_temp is not null or max_temp is not null),
  check (min_temp is null or max_temp is null or min_temp <= max_temp)
);
create index if not exists equipment_unit on equipment (unit_id, active, name);

/** Limites padrão por tipo de equipamento (RDC 216/2004; a RT revisa). */
create or replace function equipment_default_limits(p_kind text, out min_temp numeric, out max_temp numeric)
language sql immutable as $$
  select case p_kind when 'hot_holding' then 60 end::numeric,
         case p_kind when 'refrigerator' then 5 when 'cold_room' then 5 when 'cold_holding' then 5
                     when 'freezer' then -18 when 'freezer_room' then -18 end::numeric;
$$;

/** Limites por etapa do alimento: cocção e reaquecimento ≥ 70 °C, quente ≥ 60 °C, frio ≤ 5 °C, fim do resfriamento ≤ 10 °C. */
create or replace function food_stage_limits(p_stage text, out min_temp numeric, out max_temp numeric)
language sql immutable as $$
  select case p_stage when 'cooking' then 70 when 'reheating' then 70 when 'holding_hot' then 60 end::numeric,
         case p_stage when 'holding_cold' then 5 when 'cooling' then 10 end::numeric;
$$;

alter table non_conformities add column if not exists equipment_id uuid references equipment (id) on delete set null;

create table if not exists temperature_readings (
  id                uuid primary key default gen_random_uuid(),
  seq               bigint generated always as identity,
  organization_id   uuid not null references organizations (id) on delete cascade,
  unit_id           uuid not null references production_units (id) on delete cascade,
  equipment_id      uuid references equipment (id) on delete cascade,
  food_stage        text check (food_stage is null or food_stage in ('cooking', 'reheating', 'holding_hot', 'holding_cold', 'cooling')),
  food_name         text check (food_name is null or char_length(btrim(food_name)) between 2 and 120),
  value             numeric(5, 1) not null check (value between -60 and 300),
  min_temp          numeric(5, 1),
  max_temp          numeric(5, 1),
  out_of_range      boolean not null default false,
  corrective_action text check (corrective_action is null or char_length(corrective_action) <= 1000),
  source            text not null default 'manual' check (source in ('manual', 'sensor')),
  client_id         uuid not null unique,
  recorded_by       uuid references directus_users (id) on delete set null,
  recorded_at       timestamptz not null default now(),
  non_conformity_id uuid references non_conformities (id) on delete set null,
  check ((equipment_id is null) = (food_stage is not null)),
  check (food_stage is null or food_name is not null)
);
create index if not exists temperature_readings_equipment on temperature_readings (equipment_id, recorded_at desc);
create index if not exists temperature_readings_unit on temperature_readings (unit_id, recorded_at desc);

create or replace function equipment_guard() returns trigger language plpgsql as $$
declare u production_units; d record;
begin
  select * into u from production_units where id = new.unit_id;
  if tg_op = 'INSERT' then
    if u.id is null or not org_has_module(u.organization_id, 'uan') then
      raise exception 'Unidade indisponível' using errcode = 'P0001';
    end if;
    new.organization_id := u.organization_id;
    if new.min_temp is null and new.max_temp is null then
      d := equipment_default_limits(new.kind);
      new.min_temp := d.min_temp; new.max_temp := d.max_temp;
    end if;
    new.created_at := now();
  else
    if new.unit_id <> old.unit_id or new.organization_id <> old.organization_id then
      raise exception 'O equipamento não muda de unidade' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists equipment_guard on equipment;
create trigger equipment_guard before insert or update on equipment for each row execute function equipment_guard();

-- Leitura: limites copiados do equipamento ou da etapa; fora do limite exige ação corretiva; imutável.
create or replace function temperature_readings_guard() returns trigger language plpgsql as $$
declare e equipment; u production_units; l record;
begin
  if tg_op <> 'INSERT' then
    if tg_op = 'DELETE' and not exists (select 1 from production_units where id = old.unit_id) then return old; end if;
    if tg_op = 'UPDATE' and new.non_conformity_id is distinct from old.non_conformity_id
       and (to_jsonb(new) - 'non_conformity_id') = (to_jsonb(old) - 'non_conformity_id') then
      return new; -- só a ligação com a não conformidade
    end if;
    raise exception 'Leituras de temperatura não se alteram nem se apagam; registre uma nova' using errcode = 'P0001';
  end if;
  if new.equipment_id is not null then
    select * into e from equipment where id = new.equipment_id;
    if e.id is null or not e.active then raise exception 'Equipamento indisponível' using errcode = 'P0001'; end if;
    new.unit_id := e.unit_id;
    new.min_temp := e.min_temp; new.max_temp := e.max_temp;
    new.food_name := null;
  else
    l := food_stage_limits(new.food_stage);
    new.min_temp := l.min_temp; new.max_temp := l.max_temp;
  end if;
  select * into u from production_units where id = new.unit_id;
  if u.id is null or not u.active or not org_has_module(u.organization_id, 'uan') then
    raise exception 'Só unidades ativas registram temperatura' using errcode = 'P0001';
  end if;
  new.organization_id := u.organization_id;
  new.out_of_range := (new.min_temp is not null and new.value < new.min_temp) or (new.max_temp is not null and new.value > new.max_temp);
  new.corrective_action := nullif(btrim(new.corrective_action), '');
  if new.out_of_range and new.corrective_action is null then
    raise exception 'Temperatura fora do limite: registre a ação corretiva' using errcode = 'P0001';
  end if;
  new.non_conformity_id := null;
  if new.source = 'manual' then new.recorded_at := now(); end if;
  return new;
end $$;
drop trigger if exists temperature_readings_guard on temperature_readings;
create trigger temperature_readings_guard before insert or update or delete on temperature_readings
  for each row execute function temperature_readings_guard();

-- Duas leituras seguidas fora do limite no mesmo equipamento: abre não conformidade (se não houver aberta).
create or replace function temperature_readings_nc() returns trigger language plpgsql security definer set search_path = public as $$
declare prev temperature_readings; e equipment; nc uuid;
begin
  if new.equipment_id is null or not new.out_of_range then return null; end if;
  select * into prev from temperature_readings
   where equipment_id = new.equipment_id and id <> new.id and (recorded_at, seq) < (new.recorded_at, new.seq)
   order by recorded_at desc, seq desc limit 1;
  if prev.id is null or not prev.out_of_range then return null; end if;
  if exists (select 1 from non_conformities where equipment_id = new.equipment_id and status in ('open', 'in_progress')) then return null; end if;
  select * into e from equipment where id = new.equipment_id;
  insert into non_conformities (organization_id, unit_id, source, equipment_id, title, description, severity, due_at, opened_by)
  values (new.organization_id, new.unit_id, 'temperature', e.id,
          left(e.name || ': temperatura fora do limite em leituras seguidas', 500),
          left(format('Leituras: %s °C e %s °C (limite %s). Ação registrada: %s', prev.value, new.value,
                      concat_ws(' a ', coalesce('mín. ' || e.min_temp, null), coalesce('máx. ' || e.max_temp, null)), new.corrective_action), 2000),
          'high', nc_due('high'), new.recorded_by)
  returning id into nc;
  update temperature_readings set non_conformity_id = nc where id = new.id;
  return null;
end $$;
drop trigger if exists temperature_readings_nc on temperature_readings;
create trigger temperature_readings_nc after insert on temperature_readings
  for each row execute function temperature_readings_nc();

do $$
declare t text;
begin
  foreach t in array array['equipment', 'temperature_readings'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0036_temperatures') on conflict do nothing;

commit;
