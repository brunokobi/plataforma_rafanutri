-- RN-054 — Pacotes de consultas: catálogo do consultório, venda ao paciente e consumo das sessões. Idempotente.
-- Regras no banco:
--   * catálogo e venda só por owner/nutricionista; paciente ativo do consultório;
--   * a sessão é consumida quando a consulta fica "concluída": se a consulta não tem pacote, o banco liga ao pacote
--     ativo mais antigo do paciente com sessão sobrando; desfazer a conclusão devolve a sessão (recontagem);
--   * pacote com todas as sessões usadas fica "finished" e não aceita outra consulta; vencido vira "expired"
--     (expire_patient_packages(), chamada pelos endpoints) e também não aceita; cancelado não volta;
--   * a venda gera os lançamentos no financeiro (feito pelo endpoint, na mesma transação).

begin;

create table if not exists service_packages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) between 2 and 80),
  sessions        integer not null check (sessions between 1 and 100),
  price_cents     bigint not null check (price_cents > 0 and price_cents <= 10000000000),
  validity_days   integer check (validity_days is null or validity_days between 1 and 730),
  active          boolean not null default true,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now()
);
create index if not exists service_packages_org on service_packages (organization_id, active);

create table if not exists patient_packages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  package_id      uuid references service_packages (id) on delete set null,
  name            text not null check (length(trim(name)) between 2 and 80),
  sessions_total  integer not null check (sessions_total between 1 and 100),
  sessions_used   integer not null default 0 check (sessions_used >= 0),
  price_cents     bigint not null check (price_cents > 0),
  sold_at         date not null default current_date,
  expires_at      date,
  status          text not null default 'active' check (status in ('active', 'finished', 'expired', 'cancelled')),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now()
);
create index if not exists patient_packages_patient on patient_packages (patient_id, status);

alter table appointments add column if not exists patient_package_id uuid references patient_packages (id) on delete set null;
create index if not exists appointments_package on appointments (patient_package_id) where patient_package_id is not null;
alter table financial_transactions add column if not exists patient_package_id uuid references patient_packages (id) on delete set null;

create or replace function service_packages_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista cria pacotes' using errcode = 'P0001';
    end if;
  elsif new.organization_id <> old.organization_id then
    raise exception 'O pacote não muda de consultório' using errcode = 'P0001';
  end if;
  new.name := trim(new.name);
  return new;
end $$;
drop trigger if exists service_packages_guard on service_packages;
create trigger service_packages_guard before insert or update on service_packages
  for each row execute function service_packages_guard();

/** Situação do pacote a partir das sessões usadas e da validade (cancelado não muda). */
create or replace function patient_package_status(p patient_packages) returns text language sql stable as $$
  select case
    when p.status = 'cancelled' then 'cancelled'
    when p.sessions_used >= p.sessions_total then 'finished'
    when p.expires_at is not null and p.expires_at < current_date then 'expired'
    else 'active'
  end
$$;

create or replace function patient_packages_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista vende pacotes' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório compram pacotes' using errcode = 'P0001';
    end if;
    if new.package_id is not null and not exists (select 1 from service_packages where id = new.package_id and organization_id = new.organization_id) then
      raise exception 'Pacote de outro consultório' using errcode = 'P0001';
    end if;
    new.sessions_used := 0;
    new.date_created := now();
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.sessions_total <> old.sessions_total
       or new.user_created is distinct from old.user_created then
      raise exception 'O pacote vendido não muda de paciente nem de número de sessões' using errcode = 'P0001';
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'Pacote cancelado não volta' using errcode = 'P0001';
    end if;
  end if;
  new.name := trim(new.name);
  if new.status <> 'cancelled' then
    new.status := patient_package_status(new);
  end if;
  return new;
end $$;
drop trigger if exists patient_packages_guard on patient_packages;
create trigger patient_packages_guard before insert or update on patient_packages
  for each row execute function patient_packages_guard();

/** Reconta as sessões usadas (consultas concluídas ligadas ao pacote). */
create or replace function refresh_patient_package(pp uuid) returns void language sql as $$
  update patient_packages
     set sessions_used = (select count(*) from appointments where patient_package_id = pp and status = 'completed')
   where id = pp
$$;

/** Marca como vencidos os pacotes ativos com validade passada. Devolve quantos mudaram. */
create or replace function expire_patient_packages(org uuid default null) returns integer language plpgsql as $$
declare n integer;
begin
  update patient_packages set status = 'expired'
   where status = 'active' and expires_at is not null and expires_at < current_date and (org is null or organization_id = org);
  get diagnostics n = row_count;
  return n;
end $$;

-- Consulta: valida o pacote e, ao concluir sem pacote, liga ao pacote ativo mais antigo com sessão sobrando.
create or replace function appointments_package_guard() returns trigger language plpgsql as $$
declare
  pp patient_packages;
  used integer;
begin
  if new.patient_package_id is null and new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    select p.* into pp from patient_packages p
     where p.patient_id = new.patient_id and p.organization_id = new.organization_id and p.status = 'active'
       and (p.expires_at is null or p.expires_at >= current_date) and p.sessions_used < p.sessions_total
     order by p.sold_at, p.date_created limit 1;
    if pp.id is not null then
      new.patient_package_id := pp.id;
    end if;
    return new;
  end if;
  if new.patient_package_id is not null
     and (tg_op = 'INSERT' or new.patient_package_id is distinct from old.patient_package_id or (new.status = 'completed' and old.status is distinct from 'completed')) then
    select * into pp from patient_packages where id = new.patient_package_id;
    if pp.id is null or pp.organization_id <> new.organization_id or pp.patient_id <> new.patient_id then
      raise exception 'Pacote de outro paciente' using errcode = 'P0001';
    end if;
    if pp.status = 'cancelled' then
      raise exception 'Pacote cancelado' using errcode = 'P0001';
    end if;
    if new.status = 'completed' then
      select count(*) into used from appointments where patient_package_id = pp.id and status = 'completed' and id <> new.id;
      if used >= pp.sessions_total then
        raise exception 'O pacote já usou todas as sessões' using errcode = 'P0001';
      end if;
      if pp.expires_at is not null and pp.expires_at < current_date then
        raise exception 'O pacote venceu em %', to_char(pp.expires_at, 'DD/MM/YYYY') using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists appointments_package_guard on appointments;
create trigger appointments_package_guard before insert or update of status, patient_package_id on appointments
  for each row execute function appointments_package_guard();

create or replace function appointments_package_count() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.patient_package_id is not null then
    perform refresh_patient_package(old.patient_package_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.patient_package_id is not null
     and (tg_op = 'INSERT' or new.patient_package_id is distinct from old.patient_package_id or new.status is distinct from old.status) then
    perform refresh_patient_package(new.patient_package_id);
  end if;
  return null;
end $$;
drop trigger if exists appointments_package_count on appointments;
create trigger appointments_package_count after insert or update of status, patient_package_id or delete on appointments
  for each row execute function appointments_package_count();

insert into schema_migrations (version) values ('0026_packages') on conflict do nothing;

commit;
