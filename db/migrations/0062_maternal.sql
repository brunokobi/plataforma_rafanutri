-- Módulo materno-infantil: perímetro cefálico e posição da medida nas avaliações (curvas da OMS) e
-- acompanhamento da gestação (ganho de peso pelas curvas brasileiras). Idempotente.
-- O peso da gestante ao longo das semanas vem das próprias avaliações antropométricas da paciente.

begin;

alter table anthropometric_assessments
  add column if not exists head_circumference_cm numeric(4, 1) check (head_circumference_cm is null or head_circumference_cm between 25 and 60),
  add column if not exists measured_lying boolean;

create table if not exists pregnancies (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations (id) on delete cascade,
  patient_id              uuid not null references patients (id) on delete cascade,
  lmp_date                date not null check (lmp_date between date '2000-01-01' and current_date),
  pre_pregnancy_weight_kg numeric(5, 1) not null check (pre_pregnancy_weight_kg between 25 and 250),
  height_cm               numeric(5, 1) not null check (height_cm between 100 and 220),
  status                  text not null default 'active' check (status in ('active', 'ended')),
  ended_on                date check (ended_on is null or ended_on >= lmp_date),
  outcome                 text check (outcome is null or outcome in ('birth', 'loss', 'other')),
  notes                   text check (notes is null or length(notes) <= 1000),
  user_created            uuid references directus_users (id) on delete set null,
  date_created            timestamptz not null default now(),
  date_updated            timestamptz,
  constraint pregnancies_end check ((status = 'ended') = (ended_on is not null))
);

create index if not exists pregnancies_patient on pregnancies (patient_id, lmp_date desc);
create unique index if not exists pregnancies_one_active on pregnancies (patient_id) where status = 'active';

create or replace function pregnancies_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A gestação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
    return new;
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and coalesce(sex, 'female') = 'female') then
    raise exception 'Paciente não encontrada neste consultório' using errcode = 'P0001';
  end if;
  if new.user_created is null or not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
  ) then
    raise exception 'Só owner ou nutricionista do consultório registra a gestação' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pregnancies_guard on pregnancies;
create trigger pregnancies_guard before insert or update on pregnancies for each row execute function pregnancies_guard();

drop trigger if exists pregnancies_audit on pregnancies;
create trigger pregnancies_audit after insert or update or delete on pregnancies for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0062_maternal') on conflict do nothing;

commit;
