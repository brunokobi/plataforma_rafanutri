-- Acompanhamento em casa pelo paciente (área do paciente). Idempotente.
--   * patient_weight_logs: pesagens registradas pelo próprio paciente (dia e horário da pesagem), separadas das
--     avaliações do consultório (anthropometric_assessments), que continuam sendo a referência clínica;
--   * patient_water_logs: água bebida (ml) com o horário;
--   * patient_habit_settings: meta de água (definida pelo nutricionista; nula = 35 ml/kg) e lembretes de água
--     (ligados pelo paciente: intervalo e janela do dia, enviados pelo Telegram);
--   * patient_goals + patient_goal_checks: metas criadas pelo nutricionista e marcadas pelo paciente por dia;
--   * patient_meal_checks: refeição do plano marcada como feita no dia (adesão ao plano);
--   * "O que o paciente vê" ganha show_body (altura, IMC e medidas), self_weight (registrar peso), water, goals,
--     meal_checks e weight_neutral (sem números de peso: transtorno alimentar). Os cinco primeiros vêm ligados;
--   * notification_outbox.kind ganha water_reminder (só Telegram).
-- Acesso conferido nos endpoints (directus/extensions/rafanutri/tracking.js).

begin;

-- ── O que o paciente vê ────────────────────────────────────────────────────────────────────
create or replace function share_settings_valid(s jsonb) returns boolean language sql immutable as $$
  select s is null or (
    jsonb_typeof(s) = 'object'
    and not exists (select 1 from jsonb_object_keys(s) k where k not in (
      'show_kcal', 'show_macros', 'show_weight_history', 'show_maternal',
      'show_body', 'self_weight', 'water', 'goals', 'meal_checks', 'weight_neutral'))
    and not exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) <> 'boolean')
  )
$$;

create or replace function patient_share(p_patient uuid) returns jsonb language sql stable as $$
  select '{"show_kcal": false, "show_macros": false, "show_weight_history": false, "show_maternal": false,
           "show_body": true, "self_weight": true, "water": true, "goals": true, "meal_checks": true, "weight_neutral": false}'::jsonb
         || coalesce(o.patient_share_defaults, '{}'::jsonb)
         || coalesce(p.share_settings, '{}'::jsonb)
  from patients p join organizations o on o.id = p.organization_id
  where p.id = p_patient
$$;

-- Mesma regra de consultório para as tabelas novas: o paciente é do consultório da linha.
create or replace function tracking_patient_guard() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.patient_id is distinct from old.patient_id or new.organization_id is distinct from old.organization_id) then
    raise exception 'Registro não muda de paciente' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── Peso registrado pelo paciente ──────────────────────────────────────────────────────────
create table if not exists patient_weight_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  weight_kg       numeric(5, 2) not null check (weight_kg between 2 and 400),
  measured_at     timestamptz not null default now() check (measured_at <= now() + interval '5 minutes'),
  note            text check (note is null or char_length(note) <= 200),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists patient_weight_logs_patient on patient_weight_logs (patient_id, measured_at desc);
drop trigger if exists patient_weight_logs_guard on patient_weight_logs;
create trigger patient_weight_logs_guard before insert or update on patient_weight_logs for each row execute function tracking_patient_guard();

-- ── Água ───────────────────────────────────────────────────────────────────────────────────
create table if not exists patient_water_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  amount_ml       integer not null check (amount_ml between 20 and 3000),
  logged_at       timestamptz not null default now() check (logged_at <= now() + interval '5 minutes'),
  created_at      timestamptz not null default now()
);
create index if not exists patient_water_logs_patient on patient_water_logs (patient_id, logged_at desc);
drop trigger if exists patient_water_logs_guard on patient_water_logs;
create trigger patient_water_logs_guard before insert or update on patient_water_logs for each row execute function tracking_patient_guard();

create table if not exists patient_habit_settings (
  patient_id           uuid primary key references patients (id) on delete cascade,
  organization_id      uuid not null references organizations (id) on delete cascade,
  water_goal_ml        integer check (water_goal_ml is null or water_goal_ml between 500 and 6000),
  water_reminders      boolean not null default false,
  reminder_every_min   integer not null default 120 check (reminder_every_min in (60, 90, 120, 180, 240)),
  reminder_start       time not null default '08:00',
  reminder_end         time not null default '20:00',
  last_reminder_at     timestamptz,
  updated_at           timestamptz not null default now(),
  check (reminder_end > reminder_start)
);
drop trigger if exists patient_habit_settings_guard on patient_habit_settings;
create trigger patient_habit_settings_guard before insert or update on patient_habit_settings for each row execute function tracking_patient_guard();

-- ── Metas ──────────────────────────────────────────────────────────────────────────────────
create table if not exists patient_goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  title           text not null check (char_length(btrim(title)) between 2 and 120),
  details         text check (details is null or char_length(details) <= 500),
  kind            text not null default 'habit' check (kind in ('habit', 'weight')),
  frequency       text not null default 'daily' check (frequency in ('daily', 'weekly')),
  times_per_week  smallint check (times_per_week is null or times_per_week between 1 and 7),
  target_weight_kg numeric(5, 2) check (target_weight_kg is null or target_weight_kg between 2 and 400),
  active          boolean not null default true,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz,
  check (kind <> 'weight' or target_weight_kg is not null),
  check (frequency <> 'weekly' or times_per_week is not null)
);
create index if not exists patient_goals_patient on patient_goals (patient_id, active, created_at);
drop trigger if exists patient_goals_guard on patient_goals;
create trigger patient_goals_guard before insert or update on patient_goals for each row execute function tracking_patient_guard();

create table if not exists patient_goal_checks (
  goal_id     uuid not null references patient_goals (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (goal_id, day)
);

-- ── Refeições feitas ───────────────────────────────────────────────────────────────────────
create table if not exists patient_meal_checks (
  patient_id  uuid not null references patients (id) on delete cascade,
  plan_id     uuid not null references meal_plans (id) on delete cascade,
  meal_id     text not null check (char_length(meal_id) between 1 and 64),
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (patient_id, plan_id, meal_id, day)
);

-- ── Lembrete de água ───────────────────────────────────────────────────────────────────────
alter table notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'appointment_reminder', 'appointment_scheduled', 'appointment_changed', 'appointment_cancelled', 'plan_published', 'patient_invite', 'test',
  'invoice_created', 'invoice_due', 'payment_reported', 'payment_confirmed', 'subscription_ended', 'feeding_reaction',
  'message_to_patient', 'message_to_professional', 'water_reminder'));

insert into schema_migrations (version) values ('0072_patient_tracking') on conflict do nothing;

commit;
