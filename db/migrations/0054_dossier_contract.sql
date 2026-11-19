-- U6b/U7 — Licenças da unidade, Manual de Boas Práticas e dossiê emitidos (RN-157, RN-166) e faturamento do
-- contrato Enterprise (RN-124). Idempotente.
--
-- Decisões:
-- - `unit_licenses`: alvará sanitário, certificado do RT, controle de pragas, limpeza do reservatório e
--   outros, com validade e arquivo — entram no dossiê e no painel (vencidos).
-- - `compliance_exports`: cada Manual ou dossiê emitido fica registrado (período, versões de documento
--   incluídas, resumo da verificação de integridade, hash do PDF, arquivo). Imutável. O Manual tem número de
--   edição por unidade.
-- - Contrato: faturas por período (boleto/Pix pelo gateway, quando houver) e `uan_contract_state` =
--   active | read_only (até 90 dias depois do fim) | ended | none. O bloqueio de escrita no modo leitura
--   fica no endpoint.

begin;

create table if not exists unit_licenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  kind            text not null check (kind in ('sanitary_permit', 'rt_certificate', 'pest_control', 'water_tank_cleaning', 'fire_permit', 'other')),
  title           text check (title is null or char_length(title) <= 160),
  number          text check (number is null or char_length(number) <= 80),
  issued_on       date,
  valid_until     date,
  provider        text check (provider is null or char_length(provider) <= 160),
  file            uuid references directus_files (id) on delete set null,
  notes           text check (notes is null or char_length(notes) <= 1000),
  archived        boolean not null default false,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (valid_until is null or issued_on is null or valid_until >= issued_on)
);
create index if not exists unit_licenses_unit on unit_licenses (unit_id, archived, valid_until);
drop trigger if exists unit_licenses_guard on unit_licenses;
create trigger unit_licenses_guard before insert or update on unit_licenses for each row execute function uan_unit_row_guard();

create table if not exists compliance_exports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  kind            text not null check (kind in ('manual', 'dossier')),
  edition         integer,
  period_from     date,
  period_to       date,
  includes        jsonb not null default '{}'::jsonb check (jsonb_typeof(includes) = 'object'),
  integrity       jsonb check (integrity is null or jsonb_typeof(integrity) = 'object'),
  file            uuid references directus_files (id) on delete set null,
  file_hash       text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  signed_by       uuid references directus_users (id) on delete set null,
  signed_name     text check (signed_name is null or char_length(signed_name) <= 160),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (kind <> 'dossier' or (period_from is not null and period_to is not null and period_to >= period_from and period_to - period_from <= 366))
);
create index if not exists compliance_exports_unit on compliance_exports (unit_id, kind, created_at desc);
create unique index if not exists compliance_exports_edition on compliance_exports (unit_id, edition) where kind = 'manual';

create or replace function compliance_exports_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.created_at := now();
    if new.kind = 'manual' then
      perform 1 from production_units where id = new.unit_id for update; -- numeração sem corrida
      new.edition := coalesce((select max(edition) from compliance_exports where unit_id = new.unit_id and kind = 'manual'), 0) + 1;
    else
      new.edition := null;
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'file' - 'signed_by' - 'created_by') = (to_jsonb(old) - 'file' - 'signed_by' - 'created_by')
     and (new.file is null or new.file = old.file) and (new.signed_by is null or new.signed_by = old.signed_by) then
    return new; -- FK set null
  end if;
  -- o arquivo pode ser anexado uma vez, depois de gerado, se o hash bate com o registrado
  if old.file is null and new.file is not null and (to_jsonb(new) - 'file') = (to_jsonb(old) - 'file') then
    return new;
  end if;
  raise exception 'Emissão registrada não se altera' using errcode = 'P0001';
end $$;
drop trigger if exists compliance_exports_guard on compliance_exports;
create trigger compliance_exports_guard before insert or update on compliance_exports for each row execute function compliance_exports_guard();
drop trigger if exists compliance_exports_no_delete on compliance_exports;
create trigger compliance_exports_no_delete before delete on compliance_exports for each row execute function uan_no_delete();

-- Contrato: forma de cobrança e faturas.
alter table organization_contracts add column if not exists billing_method text not null default 'invoice';
do $$ begin
  alter table organization_contracts add constraint organization_contracts_billing check (billing_method in ('invoice', 'pix', 'boleto', 'card'));
exception when duplicate_object then null; end $$;
alter table organization_contracts add column if not exists notes text check (notes is null or char_length(notes) <= 1000);

create table if not exists contract_invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  contract_id     uuid not null references organization_contracts (id) on delete cascade,
  period_start    date not null,
  period_end      date not null check (period_end >= period_start),
  amount_cents    integer not null check (amount_cents >= 0),
  due_on          date not null,
  status          text not null default 'open' check (status in ('open', 'paid', 'overdue', 'void')),
  paid_at         timestamptz,
  gateway         text check (gateway is null or char_length(gateway) <= 40),
  gateway_id      text check (gateway_id is null or char_length(gateway_id) <= 120),
  payment_url     text check (payment_url is null or payment_url ~ '^https://'),
  created_at      timestamptz not null default now(),
  unique (contract_id, period_start),
  check ((status = 'paid') = (paid_at is not null))
);
create index if not exists contract_invoices_org on contract_invoices (organization_id, due_on desc);
create unique index if not exists contract_invoices_gateway on contract_invoices (gateway, gateway_id) where gateway_id is not null;

create or replace function contract_invoices_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from organization_contracts where id = new.contract_id);
    return new;
  end if;
  if new.contract_id <> old.contract_id or new.organization_id <> old.organization_id or new.period_start <> old.period_start
     or new.period_end <> old.period_end or new.amount_cents <> old.amount_cents then
    raise exception 'Fatura emitida não muda de valor nem de período; cancele e emita outra' using errcode = 'P0001';
  end if;
  if old.status in ('paid', 'void') and new.status <> old.status then
    raise exception 'Fatura paga ou cancelada não muda de situação' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists contract_invoices_guard on contract_invoices;
create trigger contract_invoices_guard before insert or update on contract_invoices for each row execute function contract_invoices_guard();

/** Situação do contrato UAN: active | read_only (até 90 dias depois do fim) | ended | none. */
create or replace function uan_contract_state(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from organization_contracts where organization_id = p_org and starts_at <= current_date
                   and (ends_at is null or ends_at >= current_date)) then 'active'
    when (select max(ends_at) from organization_contracts where organization_id = p_org and ends_at < current_date) >= current_date - 90 then 'read_only'
    when exists (select 1 from organization_contracts where organization_id = p_org) then 'ended'
    else 'none'
  end;
$$;

do $$
declare t text;
begin
  foreach t in array array['unit_licenses', 'compliance_exports', 'contract_invoices'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0054_dossier_contract') on conflict do nothing;

commit;
