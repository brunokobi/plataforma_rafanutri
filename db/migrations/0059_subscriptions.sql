-- Assinatura da plataforma paga por Pix (planos Essencial, Profissional e Clínica). Idempotente.
--
-- Decisões:
-- - Pix direto na chave da Rafanutri (QR e copia-e-cola com valor; sem gateway nem taxa). O consultório
--   avisa "já paguei"; o admin da plataforma confere no extrato e confirma. A confirmação libera o plano
--   (organizations.plan) e estende o período pago. Pronto para trocar por gateway depois (gateway_id).
-- - Preço e venda dos planos ficam em plans (price_cents, sellable): o admin muda pela tela. Plano com
--   sellable = false ou preço zero não aparece para assinar.
-- - subscriptions: uma por consultório. Renovação mensal: a fatura do mês seguinte sai 7 dias antes do
--   fim do período; sem pagamento até o fim da carência (grace_days), o consultório volta ao Gratuito.
--   Mudança de plano com assinatura ativa vale a partir da próxima fatura (next_plan).
-- - Consultório com plano pago sem linha em subscriptions (cortesia, definido por SQL) não é mexido.
-- - Escrita só pela extensão, com rafanutri.billing = on na transação (nada pela API de itens).
-- - Avisos de cobrança vão para pessoas (owner do consultório, admins): notification_outbox ganha
--   user_id e user_contact_prefs guarda o Telegram de cada pessoa (mesmo bot dos pacientes).

begin;

-- Planos pagos (limites iguais a apps/web/lib/modules/plans.ts). Preço começa em zero e fora de venda.
alter table plans add column if not exists sellable boolean not null default false;
insert into plans (code, name, max_active_patients, max_members, price_cents) values
  ('essential', 'Essencial', null, 1, 0),
  ('professional', 'Profissional', null, 1, 0),
  ('clinic', 'Clínica', null, null, 0)
on conflict (code) do nothing;

create table if not exists platform_billing (
  id             boolean primary key default true check (id),
  pix_key        text check (pix_key is null or char_length(pix_key) between 5 and 77),
  receiver_name  text check (receiver_name is null or receiver_name ~ '^[A-Za-z0-9 .&-]{3,25}$'),
  receiver_city  text check (receiver_city is null or receiver_city ~ '^[A-Za-z .-]{2,15}$'),
  notify_email   text check (notify_email is null or notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  grace_days     integer not null default 7 check (grace_days between 0 and 30),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references directus_users (id) on delete set null
);
insert into platform_billing (id) values (true) on conflict do nothing;

create table if not exists subscriptions (
  organization_id      uuid primary key references organizations (id) on delete cascade,
  plan                 text not null references plans (code),
  next_plan            text references plans (code),
  status               text not null default 'pending' check (status in ('pending', 'active', 'canceled', 'ended')),
  current_period_end   date,
  cancel_at_period_end boolean not null default false,
  user_created         uuid references directus_users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (plan <> 'free' and (next_plan is null or next_plan <> 'free')),
  check (status <> 'active' or current_period_end is not null)
);

create table if not exists subscription_invoices (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  plan             text not null references plans (code),
  amount_cents     integer not null check (amount_cents between 100 and 100000000),
  period_start     date not null,
  period_end       date not null check (period_end > period_start),
  due_on           date not null,
  status           text not null default 'open' check (status in ('open', 'paid', 'void')),
  txid             text not null unique check (txid ~ '^[A-Za-z0-9]{1,25}$'),
  pix_payload      text not null check (char_length(pix_payload) between 50 and 512),
  reported_paid_at timestamptz,
  paid_at          timestamptz,
  confirmed_by     uuid references directus_users (id) on delete set null,
  gateway          text check (gateway is null or char_length(gateway) <= 40),
  gateway_id       text check (gateway_id is null or char_length(gateway_id) <= 120),
  created_at       timestamptz not null default now(),
  check ((status = 'paid') = (paid_at is not null))
);
create index if not exists subscription_invoices_org on subscription_invoices (organization_id, period_start desc);
create index if not exists subscription_invoices_open on subscription_invoices (due_on) where status = 'open';
create unique index if not exists subscription_invoices_period on subscription_invoices (organization_id, period_start) where status <> 'void';

-- Só a extensão grava (rafanutri.billing = on). Fatura paga não volta atrás nem muda valor.
create or replace function billing_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('rafanutri.billing', true), '') <> 'on' and pg_trigger_depth() = 1 then
    raise exception 'Assinatura e faturas só mudam pela plataforma' using errcode = 'P0001';
  end if;
  if tg_table_name = 'subscription_invoices' and tg_op = 'UPDATE' then
    if old.status = 'paid' and (new.status <> 'paid' or new.amount_cents <> old.amount_cents or new.paid_at <> old.paid_at) then
      raise exception 'Fatura paga não muda' using errcode = 'P0001';
    end if;
    if old.status = 'void' and new.status <> 'void' then
      raise exception 'Fatura cancelada não volta' using errcode = 'P0001';
    end if;
    if new.amount_cents <> old.amount_cents or new.period_start <> old.period_start or new.organization_id <> old.organization_id or new.txid <> old.txid then
      raise exception 'Valor, período e identificador da fatura não mudam' using errcode = 'P0001';
    end if;
  end if;
  if tg_table_name = 'subscriptions' and tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists subscriptions_guard on subscriptions;
create trigger subscriptions_guard before insert or update or delete on subscriptions for each row execute function billing_guard();
drop trigger if exists subscription_invoices_guard on subscription_invoices;
create trigger subscription_invoices_guard before insert or update or delete on subscription_invoices for each row execute function billing_guard();

-- Telegram e e-mail de pessoas (owner, admin) para os avisos de cobrança.
create table if not exists user_contact_prefs (
  user_id                  uuid primary key references directus_users (id) on delete cascade,
  telegram_opt_in          boolean not null default true,
  telegram_chat_id         bigint,
  telegram_name            text check (telegram_name is null or char_length(telegram_name) <= 120),
  telegram_linked_at       timestamptz,
  telegram_link_hash       text unique check (telegram_link_hash is null or telegram_link_hash ~ '^[0-9a-f]{64}$'),
  telegram_link_expires_at timestamptz,
  updated_at               timestamptz not null default now()
);
create or replace function user_contact_prefs_guard() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.telegram_chat_id is not null)
     or (tg_op = 'UPDATE' and new.telegram_chat_id is distinct from old.telegram_chat_id) then
    if coalesce(current_setting('rafanutri.telegram_link', true), '') <> 'on' then
      raise exception 'O Telegram só é ligado pela própria pessoa, no bot' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists user_contact_prefs_guard on user_contact_prefs;
create trigger user_contact_prefs_guard before insert or update on user_contact_prefs for each row execute function user_contact_prefs_guard();

-- Fila: avisos para pessoas e os tipos da cobrança.
alter table notification_outbox add column if not exists user_id uuid references directus_users (id) on delete cascade;
alter table notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'appointment_reminder', 'appointment_scheduled', 'appointment_changed', 'appointment_cancelled', 'plan_published', 'patient_invite', 'test',
  'invoice_created', 'invoice_due', 'payment_reported', 'payment_confirmed', 'subscription_ended'));
create index if not exists notification_outbox_user on notification_outbox (user_id, date_created desc) where user_id is not null;

-- Auditoria das faturas (quem confirmou o pagamento ou cancelou).
drop trigger if exists subscription_invoices_audit on subscription_invoices;
create trigger subscription_invoices_audit after insert or update or delete on subscription_invoices for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0059_subscriptions') on conflict do nothing;

commit;
