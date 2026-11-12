-- RN-022 — Agenda: consultas por nutricionista. Idempotente.
-- Regras no banco (ADR 0008, regra 3):
--   * o mesmo nutricionista não tem duas consultas sobrepostas (cancelada e falta não ocupam o horário);
--   * paciente do mesmo consultório; nutricionista e autor são owner/nutricionista do consultório;
--   * consulta não muda de consultório nem de paciente; concluída e cancelada não mudam de horário.
-- Horários em timestamptz; o app mostra no fuso do consultório (America/Sao_Paulo).

begin;

create extension if not exists btree_gist;

create table if not exists appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  nutritionist_id uuid not null references directus_users (id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  type            text not null default 'return' check (type in ('first', 'return')),
  mode            text not null default 'in_person' check (mode in ('in_person', 'online')),
  status          text not null default 'scheduled'
                    check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  meeting_url     text check (meeting_url is null or (meeting_url ~* '^https?://' and length(meeting_url) <= 500)),
  notes           text check (notes is null or length(notes) <= 500),   -- observação administrativa (não clínica)
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  constraint appointments_ends_after_start check (ends_at > starts_at),
  constraint appointments_max_duration check (ends_at - starts_at <= interval '8 hours')
);

create index if not exists appointments_org_starts on appointments (organization_id, starts_at);
create index if not exists appointments_patient on appointments (patient_id, starts_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_no_overlap') then
    alter table appointments add constraint appointments_no_overlap
      exclude using gist (nutritionist_id with =, tstzrange(starts_at, ends_at) with &&)
      where (status not in ('cancelled', 'no_show'));
  end if;
end $$;

create or replace function appointments_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Sem nutricionista informado: quem marca atende.
    if new.nutritionist_id is null then new.nutritionist_id := new.user_created; end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório marca consultas' using errcode = 'P0001';
    end if;
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A consulta não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    if old.status in ('completed', 'cancelled')
       and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at or new.nutritionist_id <> old.nutritionist_id) then
      raise exception 'Consulta concluída ou cancelada não pode ser remarcada' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  if new.nutritionist_id is null or not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.nutritionist_id and role in ('owner', 'nutritionist')
  ) then
    raise exception 'O nutricionista da consulta precisa ser do consultório' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- nutritionist_id pode chegar nulo e ser preenchido pelo gatilho: o NOT NULL é conferido depois.
drop trigger if exists appointments_guard on appointments;
create trigger appointments_guard before insert or update on appointments
  for each row execute function appointments_guard();

insert into schema_migrations (version) values ('0007_appointments') on conflict do nothing;

commit;
