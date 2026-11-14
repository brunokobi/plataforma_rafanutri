-- RN-055 — Recibo numerado por consultório. Idempotente.
-- Regras no banco:
--   * só de recebimento (receita) pago do próprio consultório; um recibo por lançamento;
--   * número sequencial por consultório, sem repetir nem com emissões simultâneas (trava por consultório);
--   * o recibo guarda uma cópia dos dados (emitente, pagador, valor, serviço) e não muda depois de emitido;
--   * lançamento com recibo não pode ser excluído (só cancelado); apagar o consultório leva tudo junto.

begin;

alter table organizations add column if not exists receipt_tax_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_receipt_tax_id_check') then
    alter table organizations add constraint organizations_receipt_tax_id_check check (receipt_tax_id is null or receipt_tax_id ~ '^(\d{11}|\d{14})$');
  end if;
end $$;

create table if not exists receipts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  transaction_id    uuid not null unique references financial_transactions (id) on delete no action,
  number            integer not null,
  issued_at         timestamptz not null default now(),
  amount_cents      bigint not null check (amount_cents > 0),
  paid_at           date not null,
  payment_method    text,
  service           text not null check (length(trim(service)) between 2 and 200),
  payer_name        text not null check (length(trim(payer_name)) between 2 and 160),
  payer_cpf         text check (payer_cpf is null or payer_cpf ~ '^\d{11}$'),
  issuer_name       text not null check (length(trim(issuer_name)) between 2 and 160),
  issuer_crn        text,
  issuer_tax_id     text check (issuer_tax_id is null or issuer_tax_id ~ '^(\d{11}|\d{14})$'),
  practice_name     text not null,
  user_created      uuid references directus_users (id) on delete set null,
  unique (organization_id, number)
);

/** Próximo número de recibo do consultório. Trava por consultório até o fim da transação. */
create or replace function next_receipt_number(org uuid) returns integer language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('receipts:' || org::text));
  return coalesce((select max(number) from receipts where organization_id = org), 0) + 1;
end $$;

create or replace function receipts_guard() returns trigger language plpgsql as $$
declare
  t financial_transactions;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Recibo emitido não muda' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    -- só junto com o consultório (cascata)
    if exists (select 1 from organizations where id = old.organization_id) then
      raise exception 'Recibo emitido não é apagado' using errcode = 'P0001';
    end if;
    return old;
  end if;
  select * into t from financial_transactions where id = new.transaction_id;
  if t.id is null or t.organization_id <> new.organization_id or t.kind <> 'income' or t.status <> 'paid' then
    raise exception 'Recibo só de recebimento pago do consultório' using errcode = 'P0001';
  end if;
  if new.user_created is null or not exists (select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created) then
    raise exception 'Só membros do consultório emitem recibos' using errcode = 'P0001';
  end if;
  new.number := next_receipt_number(new.organization_id);
  new.issued_at := now();
  new.amount_cents := t.amount_cents;
  new.paid_at := t.paid_at;
  new.payment_method := t.payment_method;
  new.service := trim(new.service);
  new.payer_name := trim(new.payer_name);
  new.issuer_name := trim(new.issuer_name);
  return new;
end $$;

drop trigger if exists receipts_guard on receipts;
create trigger receipts_guard before insert or update or delete on receipts
  for each row execute function receipts_guard();

-- Correção da 0024: a trava de exclusão (só owner/nutricionista) não pode impedir apagar o consultório inteiro.
create or replace function financial_transactions_guard() returns trigger language plpgsql as $$
declare
  cat financial_categories;
begin
  if tg_op = 'DELETE' then
    -- apagar o consultório leva os lançamentos junto (cascata): aí não há ator
    if not exists (select 1 from organizations where id = old.organization_id) then
      return old;
    end if;
    if not exists (
      select 1 from organization_members
      where organization_id = old.organization_id and role in ('owner', 'nutritionist')
        and user_id::text = coalesce(current_setting('rafanutri.actor', true), '')
    ) then
      raise exception 'Só owner ou nutricionista exclui lançamentos' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created
    ) then
      raise exception 'Só membros do consultório lançam no financeiro' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
  else
    if new.organization_id <> old.organization_id or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
      raise exception 'O lançamento não muda de consultório nem de autor' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;

  select * into cat from financial_categories where id = new.category_id;
  if cat.id is null or cat.kind <> new.kind or (cat.organization_id is not null and cat.organization_id <> new.organization_id) then
    raise exception 'Categoria inválida para este lançamento' using errcode = 'P0001';
  end if;
  if new.patient_id is not null and not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente de outro consultório' using errcode = 'P0001';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from appointments where id = new.appointment_id and organization_id = new.organization_id
      and (new.patient_id is null or patient_id = new.patient_id)
  ) then
    raise exception 'Consulta de outro consultório ou de outro paciente' using errcode = 'P0001';
  end if;
  new.description := trim(new.description);
  return new;
end $$;

insert into schema_migrations (version) values ('0025_receipts') on conflict do nothing;

commit;
