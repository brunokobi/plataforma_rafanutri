-- RN-068 — Página pública do nutricionista e agendamento online. Idempotente.
-- Lido e gravado só pelos endpoints da extensão (públicos em /rafanutri/public/practices/:slug/*).
-- Regras no banco:
--   * página desligada por padrão; o nutricionista da agenda precisa ser owner/nutricionista do consultório;
--   * pedido de agendamento segura o horário enquanto pendente: dois pedidos (ou pedido e consulta) não ocupam o
--     mesmo horário do mesmo nutricionista (trava por consultório + checagem de sobreposição);
--   * consultas criadas pelo agendamento online têm origin = 'online_booking'.

begin;

create table if not exists public_profiles (
  organization_id  uuid primary key references organizations (id) on delete cascade,
  enabled          boolean not null default false,
  headline         text check (headline is null or length(headline) <= 120),
  bio              text check (bio is null or length(bio) <= 1500),
  specialties      jsonb not null default '[]'::jsonb check (jsonb_typeof(specialties) = 'array' and jsonb_array_length(specialties) <= 10),
  address          text check (address is null or length(address) <= 200),
  city             text check (city is null or length(city) <= 80),
  in_person        boolean not null default true,
  online           boolean not null default true,
  price_first_cents  bigint check (price_first_cents is null or price_first_cents > 0),
  price_return_cents bigint check (price_return_cents is null or price_return_cents > 0),
  booking_enabled  boolean not null default false,
  require_approval boolean not null default true,
  nutritionist_id  uuid references directus_users (id) on delete set null,
  weekdays         integer[] not null default '{1,2,3,4,5}' check (weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(weekdays) between 1 and 7),
  day_start        time not null default '08:00',
  day_end          time not null default '18:00',
  slot_minutes     integer not null default 60 check (slot_minutes in (30, 45, 60, 90)),
  min_notice_hours integer not null default 12 check (min_notice_hours between 0 and 168),
  max_days_ahead   integer not null default 30 check (max_days_ahead between 1 and 90),
  updated_at       timestamptz,
  check (day_end > day_start),
  check (in_person or online)
);

create or replace function public_profiles_guard() returns trigger language plpgsql as $$
begin
  if new.nutritionist_id is not null and not exists (
    select 1 from organization_members where organization_id = new.organization_id and user_id = new.nutritionist_id and role in ('owner', 'nutritionist')
  ) then
    raise exception 'O nutricionista da agenda precisa ser do consultório' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists public_profiles_guard on public_profiles;
create trigger public_profiles_guard before insert or update on public_profiles for each row execute function public_profiles_guard();

alter table appointments add column if not exists origin text not null default 'manual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_origin_check') then
    alter table appointments add constraint appointments_origin_check check (origin in ('manual', 'online_booking'));
  end if;
end $$;

create table if not exists booking_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  nutritionist_id uuid not null references directus_users (id) on delete cascade,
  full_name       text not null check (length(trim(full_name)) between 3 and 120),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 160),
  phone           text not null check (phone ~ '^\+[1-9]\d{7,14}$'),
  mode            text not null check (mode in ('in_person', 'online')),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null check (ends_at > starts_at),
  message         text check (message is null or length(message) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  patient_id      uuid references patients (id) on delete set null,
  appointment_id  uuid references appointments (id) on delete set null,
  decided_by      uuid references directus_users (id) on delete set null,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists booking_requests_org_status on booking_requests (organization_id, status, starts_at);

/** Horário ocupado para o nutricionista: consulta que ocupa horário ou pedido pendente. */
create or replace function booking_slot_taken(org uuid, nutri uuid, s timestamptz, e timestamptz, ignore_request uuid default null) returns boolean language sql stable as $$
  select exists (select 1 from appointments a where a.organization_id = org and a.nutritionist_id = nutri
                   and a.status in ('scheduled', 'confirmed', 'completed') and a.starts_at < e and a.ends_at > s)
      or exists (select 1 from booking_requests r where r.organization_id = org and r.nutritionist_id = nutri and r.status = 'pending'
                   and (ignore_request is null or r.id <> ignore_request) and r.starts_at < e and r.ends_at > s)
$$;

create or replace function booking_requests_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('booking:' || new.organization_id::text));
    if not exists (select 1 from public_profiles where organization_id = new.organization_id and enabled and booking_enabled) then
      raise exception 'Agendamento online desligado' using errcode = 'P0001';
    end if;
    if new.starts_at < now() then
      raise exception 'Horário já passou' using errcode = 'P0001';
    end if;
    if booking_slot_taken(new.organization_id, new.nutritionist_id, new.starts_at, new.ends_at) then
      raise exception 'Horário indisponível' using errcode = 'P0001';
    end if;
    new.status := 'pending';
    new.created_at := now();
    new.full_name := trim(new.full_name);
    new.email := lower(trim(new.email));
  elsif new.organization_id <> old.organization_id or new.starts_at <> old.starts_at or new.nutritionist_id <> old.nutritionist_id then
    raise exception 'O pedido não muda de horário' using errcode = 'P0001';
  elsif old.status <> 'pending' and new.status <> old.status then
    raise exception 'Pedido já decidido' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists booking_requests_guard on booking_requests;
create trigger booking_requests_guard before insert or update on booking_requests for each row execute function booking_requests_guard();

insert into schema_migrations (version) values ('0029_public_booking') on conflict do nothing;

commit;
