-- Mensagens entre paciente e nutricionista (chat da área do paciente). Idempotente.
--   * patient_messages: uma linha por mensagem, da conversa do paciente (patient_id) com o consultório.
--     sender = 'patient' (a conta ligada ao registro, patients.app_user_id) ou 'professional' (owner/nutricionista).
--     O texto não muda depois de enviado; só read_at (lida pelo outro lado) e notified_at (aviso de não lida enviado).
--   * organizations.patient_messages: o consultório liga ou desliga as mensagens (padrão: ligadas).
--   * notification_outbox.kind ganha message_to_patient e message_to_professional (aviso de mensagem não lida,
--     sem o texto da mensagem: só "você tem mensagem nova").
-- Acesso conferido nos endpoints (directus/extensions/rafanutri/messages.js).

begin;

alter table organizations add column if not exists patient_messages boolean not null default true;

create table if not exists patient_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  sender          text not null check (sender in ('patient', 'professional')),
  author_id       uuid references directus_users (id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz,
  notified_at     timestamptz
);
create index if not exists patient_messages_conversation on patient_messages (patient_id, created_at desc);
create index if not exists patient_messages_org on patient_messages (organization_id, created_at desc);
create index if not exists patient_messages_unread on patient_messages (organization_id, sender, patient_id) where read_at is null;

create or replace function patient_messages_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.patient_id is distinct from old.patient_id
       or new.sender is distinct from old.sender or new.author_id is distinct from old.author_id
       or new.body is distinct from old.body or new.created_at is distinct from old.created_at then
      raise exception 'Mensagem enviada não muda' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  if new.sender = 'patient' then
    if new.author_id is null or not exists (select 1 from patients where id = new.patient_id and app_user_id = new.author_id and status = 'active') then
      raise exception 'Só a conta ligada ao paciente envia como paciente' using errcode = 'P0001';
    end if;
  elsif new.author_id is null or not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.author_id and role in ('owner', 'nutritionist')
  ) then
    raise exception 'Só owner ou nutricionista do consultório responde' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.read_at := null;
  new.notified_at := null;
  return new;
end $$;

drop trigger if exists patient_messages_guard on patient_messages;
create trigger patient_messages_guard before insert or update on patient_messages for each row execute function patient_messages_guard();

alter table notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'appointment_reminder', 'appointment_scheduled', 'appointment_changed', 'appointment_cancelled', 'plan_published', 'patient_invite', 'test',
  'invoice_created', 'invoice_due', 'payment_reported', 'payment_confirmed', 'subscription_ended', 'feeding_reaction',
  'message_to_patient', 'message_to_professional'));

insert into schema_migrations (version) values ('0071_patient_messages') on conflict do nothing;

commit;
