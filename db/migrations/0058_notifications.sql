-- Avisos ao paciente por e-mail e Telegram (substitui o envio automático por WhatsApp, que exige a API
-- oficial e aprovação de modelos). Idempotente.
--
-- Decisões:
-- - notification_settings: o que o consultório envia (lembretes antes da consulta, aviso de consulta
--   marcada, aviso de plano novo) e um recado opcional que vai junto do lembrete.
-- - patient_contact_prefs: canais do paciente. E-mail vale enquanto não for cancelado (aviso de serviço
--   ligado ao atendimento); o Telegram exige que o próprio paciente abra o bot pelo link (o bot não
--   pode escrever primeiro). O chat do Telegram só é gravado pela extensão (variável
--   rafanutri.telegram_link na transação): ninguém liga um chat qualquer pela API de itens.
-- - Canal: Telegram primeiro, para tudo (gratuito). E-mail só para os avisos importantes (convite, consulta
--   marcada, remarcada ou cancelada, primeiro lembrete) quando o paciente não tem Telegram ou o envio falhou.
-- - notification_outbox: fila com deduplicação (dedupe_key), tentativas e erro. A extensão gera e envia;
--   o registro fica para a nutricionista ver o que saiu. Mensagens com mais de 180 dias são apagadas pela
--   própria rotina (guardam e-mail e chat do paciente: dado pessoal, LGPD).

begin;

create table if not exists notification_settings (
  organization_id      uuid primary key references organizations (id) on delete cascade,
  reminders_enabled    boolean not null default true,
  reminder_hours       int[] not null default '{24,2}'
                         check (reminder_hours <@ array[1, 2, 3, 6, 12, 24, 48, 72] and cardinality(reminder_hours) <= 3),
  scheduled_enabled    boolean not null default true,
  plan_enabled         boolean not null default true,
  reminder_note        text check (reminder_note is null or char_length(reminder_note) <= 300),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references directus_users (id) on delete set null
);

create table if not exists patient_contact_prefs (
  patient_id               uuid primary key references patients (id) on delete cascade,
  organization_id          uuid not null references organizations (id) on delete cascade,
  email_opt_in             boolean not null default true,
  telegram_opt_in          boolean not null default true,
  telegram_chat_id         bigint,
  telegram_name            text check (telegram_name is null or char_length(telegram_name) <= 120),
  telegram_linked_at       timestamptz,
  telegram_link_hash       text unique check (telegram_link_hash is null or telegram_link_hash ~ '^[0-9a-f]{64}$'),
  telegram_link_expires_at timestamptz,
  updated_at               timestamptz not null default now()
);
create index if not exists patient_contact_prefs_chat on patient_contact_prefs (telegram_chat_id) where telegram_chat_id is not null;

create or replace function patient_contact_prefs_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    -- cascata: o paciente está sendo apagado junto com o consultório
    if pg_trigger_depth() > 1 then return new; end if;
    raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
  end if;
  if (tg_op = 'INSERT' and new.telegram_chat_id is not null)
     or (tg_op = 'UPDATE' and (new.telegram_chat_id is distinct from old.telegram_chat_id or new.organization_id <> old.organization_id)) then
    if coalesce(current_setting('rafanutri.telegram_link', true), '') <> 'on' then
      raise exception 'O Telegram do paciente só é ligado pelo próprio paciente, no bot' using errcode = 'P0001';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists patient_contact_prefs_guard on patient_contact_prefs;
create trigger patient_contact_prefs_guard before insert or update on patient_contact_prefs
  for each row execute function patient_contact_prefs_guard();

create table if not exists notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid references patients (id) on delete cascade,
  appointment_id  uuid references appointments (id) on delete cascade,
  kind            text not null check (kind in ('appointment_reminder', 'appointment_scheduled', 'appointment_changed', 'appointment_cancelled',
                                                   'plan_published', 'patient_invite', 'test')),
  channel         text not null check (channel in ('email', 'telegram')),
  recipient       text not null check (char_length(recipient) between 1 and 254),
  subject         text not null check (char_length(subject) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 4000),
  link            text check (link is null or (link ~* '^https://' and char_length(link) <= 500)),
  status          text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  attempts        smallint not null default 0 check (attempts between 0 and 10),
  last_error      text check (last_error is null or char_length(last_error) <= 500),
  dedupe_key      text unique check (dedupe_key is null or char_length(dedupe_key) <= 200),
  scheduled_at    timestamptz not null default now(),
  sent_at         timestamptz,
  date_created    timestamptz not null default now()
);
create index if not exists notification_outbox_queue on notification_outbox (scheduled_at) where status = 'queued';
create index if not exists notification_outbox_org on notification_outbox (organization_id, date_created desc);
create index if not exists notification_outbox_patient on notification_outbox (patient_id, date_created desc) where patient_id is not null;

-- Paciente de outro consultório não entra na fila de um consultório.
create or replace function notification_outbox_guard() returns trigger language plpgsql as $$
begin
  if new.patient_id is not null and not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    if pg_trigger_depth() > 1 then return new; end if;
    raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
  end if;
  if new.appointment_id is not null and not exists (select 1 from appointments where id = new.appointment_id and organization_id = new.organization_id) then
    if pg_trigger_depth() > 1 then return new; end if;
    raise exception 'A consulta não pertence a este consultório' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists notification_outbox_guard on notification_outbox;
create trigger notification_outbox_guard before insert or update of organization_id, patient_id, appointment_id on notification_outbox
  for each row execute function notification_outbox_guard();

insert into schema_migrations (version) values ('0058_notifications') on conflict do nothing;

commit;
