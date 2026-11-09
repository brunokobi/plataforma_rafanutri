-- Módulo clínico, primeira parte: pacientes (RN-020, RN-201), avaliação antropométrica (RN-028)
-- e cálculo energético (RN-030).

create table patients (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations(id) on delete cascade,
  responsible_nutritionist_id uuid references directus_users(id) on delete set null,
  full_name                   varchar(160) not null check (char_length(full_name) >= 2),
  social_name                 varchar(160),
  birth_date                  date not null check (birth_date <= current_date),
  sex                         varchar(6) not null check (sex in ('female', 'male')),
  email                       citext,
  phone                       varchar(20),
  cpf                         varchar(11) check (cpf ~ '^[0-9]{11}$'),
  occupation                  varchar(120),
  objective                   text,
  tags                        text[] not null default '{}',
  status                      varchar(10) not null default 'active' check (status in ('active', 'inactive', 'archived')),
  default_skinfold_protocol   varchar(24),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index patients_org_status_idx on patients (organization_id, status);
create index patients_name_trgm_idx on patients using gin (unaccent_immutable(lower(full_name)) gin_trgm_ops);
create unique index patients_org_cpf_uniq on patients (organization_id, cpf) where cpf is not null;
create trigger patients_updated_at before update on patients
  for each row execute function set_updated_at();

-- Limite de pacientes ativos do plano (RN-201).
create or replace function enforce_active_patient_limit() returns trigger
language plpgsql as $$
declare
  v_limit int;
  v_count int;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;

  select p.max_active_patients into v_limit
  from subscriptions s join plans p on p.code = s.plan_code
  where s.organization_id = new.organization_id;
  if v_limit is null then return new; end if;

  perform pg_advisory_xact_lock(hashtext('patients:' || new.organization_id::text));
  select count(*) into v_count from patients
  where organization_id = new.organization_id and status = 'active' and id <> new.id;

  if v_count >= v_limit then
    raise exception 'PATIENT_LIMIT_REACHED' using errcode = 'P0001', detail = format('limit=%s', v_limit);
  end if;
  return new;
end $$;
create trigger patients_limit
  before insert or update of status on patients
  for each row execute function enforce_active_patient_limit();

create table anthropometric_assessments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  patient_id        uuid not null references patients(id) on delete cascade,
  assessed_at       date not null default current_date,
  age_years         numeric(5,2) not null,
  weight_kg         numeric(6,2),
  height_cm         numeric(5,1),
  circumferences    jsonb not null default '{}',
  skinfolds         jsonb not null default '{}',
  protocol          varchar(24),
  density_equation  varchar(8),
  results           jsonb not null default '{}',
  calc_version      varchar(16) not null,
  notes             text,
  author_id         uuid references directus_users(id) on delete set null,
  created_at        timestamptz not null default now()
);
create index anthropometric_patient_idx on anthropometric_assessments (patient_id, assessed_at desc);

create table energy_calculations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  patient_id       uuid not null references patients(id) on delete cascade,
  assessment_id    uuid references anthropometric_assessments(id) on delete set null,
  formula          varchar(32) not null,
  inputs           jsonb not null,
  activity_factor  numeric(4,2) not null,
  ree_kcal         numeric(7,1) not null,
  tee_kcal         numeric(7,1) not null,
  adjustment_kcal  numeric(7,1) not null default 0,
  target_kcal      numeric(7,1) not null,
  macro_targets    jsonb not null,
  calc_version     varchar(16) not null,
  author_id        uuid references directus_users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index energy_patient_idx on energy_calculations (patient_id, created_at desc);

-- Garante que os registros filhos pertencem à mesma organização do paciente.
create or replace function check_patient_org() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'PATIENT_ORG_MISMATCH' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger anthropometric_patient_org before insert or update on anthropometric_assessments
  for each row execute function check_patient_org();
create trigger energy_patient_org before insert or update on energy_calculations
  for each row execute function check_patient_org();
