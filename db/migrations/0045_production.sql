-- U3a — Comensais (RN-137) e controle de desperdício (RN-226), com porções servidas para a adesão (RN-227).
-- Idempotente.
--
-- Decisões:
-- - diner_counts: comensais previstos e realizados por unidade, data e serviço (um registro por chave).
-- - waste_records: um registro por unidade, data, serviço e preparação (raiz da ficha); a preparação nula
--   é o registro do serviço inteiro (resto-ingesta das bandejas). Gramas, motivo, porções servidas.
--   Hora do servidor e autor; registrar de novo a mesma chave substitui os valores (correção do dia).
-- - Indicadores e lista de preparo são calculados no app (@rafanutri/nutrition-core, production.ts).

begin;

create table if not exists diner_counts (
  unit_id    uuid not null references production_units (id) on delete cascade,
  day        date not null,
  service    text not null check (service in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')),
  planned    integer check (planned is null or planned between 0 and 100000),
  actual     integer check (actual is null or actual between 0 and 100000),
  updated_by uuid references directus_users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (unit_id, day, service)
);

create table if not exists waste_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  day             date not null,
  service         text not null check (service in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper')),
  sheet_root_id   uuid references tech_sheets (id) on delete cascade,
  produced_g      integer check (produced_g is null or produced_g between 0 and 10000000),
  leftover_g      integer check (leftover_g is null or leftover_g between 0 and 10000000),
  plate_waste_g   integer check (plate_waste_g is null or plate_waste_g between 0 and 10000000),
  prep_waste_g    integer check (prep_waste_g is null or prep_waste_g between 0 and 10000000),
  portions_served integer check (portions_served is null or portions_served between 0 and 100000),
  reason          text check (reason is null or reason in ('taste', 'temperature', 'portion', 'presentation', 'repeated', 'overproduction', 'other')),
  notes           text check (notes is null or char_length(notes) <= 500),
  recorded_by     uuid references directus_users (id) on delete set null,
  recorded_at     timestamptz not null default now(),
  check (leftover_g is null or produced_g is null or leftover_g <= produced_g),
  check (sheet_root_id is not null or (produced_g is null and leftover_g is null and portions_served is null))
);
create unique index if not exists waste_records_key on waste_records (unit_id, day, service, coalesce(sheet_root_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists waste_records_unit_day on waste_records (unit_id, day desc);

create or replace function waste_records_guard() returns trigger language plpgsql as $$
begin
  new.organization_id := (select organization_id from production_units where id = new.unit_id);
  if not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  if new.sheet_root_id is not null and not exists (select 1 from tech_sheets where id = new.sheet_root_id and root_id = id and organization_id = new.organization_id) then
    raise exception 'Preparação de outra empresa' using errcode = 'P0001';
  end if;
  if new.day > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Não registre desperdício de dias futuros' using errcode = 'P0001';
  end if;
  new.recorded_at := now();
  return new;
end $$;
drop trigger if exists waste_records_guard on waste_records;
create trigger waste_records_guard before insert or update on waste_records for each row execute function waste_records_guard();

drop trigger if exists waste_records_audit on waste_records;
create trigger waste_records_audit after insert or update or delete on waste_records for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0045_production') on conflict do nothing;

commit;
