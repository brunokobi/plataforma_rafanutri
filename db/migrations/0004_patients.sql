-- RN-020 — Pacientes de cada consultório. Idempotente.
-- Regras no banco (ADR 0008, regra 3): limite de pacientes ativos do plano (Fase 1B),
-- CPF único no consultório e responsável sempre membro do consultório.

begin;

create table if not exists patients (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete cascade,
  responsible_user_id uuid references directus_users (id) on delete set null,
  full_name           text not null check (length(trim(full_name)) between 3 and 120),
  birth_date          date check (birth_date between date '1900-01-01' and current_date),
  sex                 text check (sex in ('female', 'male')),
  email               text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone               text check (phone is null or phone ~ '^\+[1-9]\d{7,14}$'),   -- E.164
  cpf                 text check (cpf is null or cpf ~ '^\d{11}$'),               -- só dígitos
  objective           text check (objective is null or length(objective) <= 300),
  status              text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  search_name         text generated always as (lower(f_unaccent(full_name))) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

create index if not exists patients_org_status on patients (organization_id, status);
create index if not exists patients_search_name_trgm on patients using gin (search_name gin_trgm_ops);
create unique index if not exists patients_org_cpf_unique on patients (organization_id, cpf) where cpf is not null;

drop trigger if exists patients_updated_at on patients;
create trigger patients_updated_at before update on patients
  for each row execute function set_updated_at();

-- Consultório não muda depois de criado (evita "mover" paciente para outro consultório).
create or replace function patients_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'O paciente não pode mudar de consultório' using errcode = 'P0001';
  end if;
  if new.responsible_user_id is not null and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id) then
    if not exists (select 1 from organization_members
                   where organization_id = new.organization_id and user_id = new.responsible_user_id) then
      raise exception 'O responsável precisa ser membro do consultório' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists patients_guard on patients;
create trigger patients_guard before insert or update on patients
  for each row execute function patients_guard();

-- Limite de pacientes ativos do plano (gratuito: 20). Arquivar ou inativar libera a vaga.
create or replace function enforce_active_patient_limit() returns trigger language plpgsql as $$
declare lim int; total int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  select p.max_active_patients into lim from organizations o join plans p on p.code = o.plan where o.id = new.organization_id;
  if lim is null then return new; end if;
  perform 1 from organizations where id = new.organization_id for update;  -- serializa concorrência
  select count(*) into total from patients where organization_id = new.organization_id and status = 'active' and id <> new.id;
  if total >= lim then
    raise exception 'O plano permite no máximo % pacientes ativos', lim using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists patients_active_limit on patients;
create trigger patients_active_limit before insert or update of status on patients
  for each row execute function enforce_active_patient_limit();

insert into schema_migrations (version) values ('0004_patients') on conflict do nothing;

commit;
