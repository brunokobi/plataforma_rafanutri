-- Materno-infantil, segunda parte (RN-113 a RN-118). Idempotente.
--   * lactations: período e tipo de aleitamento da mãe, com vínculo opcional ao bebê (também paciente do consultório);
--   * feeding_intro_progress: alergênicos introduzidos (com reação) e etapas de textura da criança; o responsável
--     também registra pelo app (recorded_by = conta ligada ao paciente);
--   * patient_guardians: responsáveis legais e o consentimento em nome do menor (LGPD, art. 14);
--   * patient_app_invites.guardian_id: convite do app feito ao responsável; a mesma conta pode ficar ligada a mais
--     de um filho no mesmo consultório (o índice único conta × consultório vira índice comum);
--   * "O que o paciente vê" ganha show_maternal (curvas, gestação e introdução alimentar no app);
--   * aviso feeding_reaction ao nutricionista quando o responsável registra reação moderada ou grave.

begin;

-- ── Lactação ───────────────────────────────────────────────────────────────────────────────
create table if not exists lactations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  baby_patient_id uuid references patients (id) on delete set null,
  started_on      date not null check (started_on between date '2000-01-01' and current_date),
  feeding_type    text not null check (feeding_type in ('exclusive', 'predominant', 'complemented', 'mixed')),
  status          text not null default 'active' check (status in ('active', 'ended')),
  ended_on        date check (ended_on is null or ended_on >= started_on),
  notes           text check (notes is null or length(notes) <= 1000),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  constraint lactations_end check ((status = 'ended') = (ended_on is not null)),
  constraint lactations_not_self check (baby_patient_id is null or baby_patient_id <> patient_id)
);
create index if not exists lactations_patient on lactations (patient_id, started_on desc);
create index if not exists lactations_baby on lactations (baby_patient_id) where baby_patient_id is not null;
create unique index if not exists lactations_one_active on lactations (patient_id) where status = 'active';

create or replace function lactations_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A lactação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  else
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and coalesce(sex, 'female') = 'female') then
      raise exception 'Paciente não encontrada neste consultório' using errcode = 'P0001';
    end if;
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório registra a lactação' using errcode = 'P0001';
    end if;
  end if;
  if new.baby_patient_id is not null and new.baby_patient_id is distinct from (case when tg_op = 'UPDATE' then old.baby_patient_id end)
     and not exists (select 1 from patients where id = new.baby_patient_id and organization_id = new.organization_id) then
    raise exception 'O bebê precisa ser paciente do mesmo consultório' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists lactations_guard on lactations;
create trigger lactations_guard before insert or update on lactations for each row execute function lactations_guard();
drop trigger if exists lactations_audit on lactations;
create trigger lactations_audit after insert or update or delete on lactations for each row execute function audit_trigger();

-- ── Introdução alimentar: alergênicos e texturas ──────────────────────────────────────────
create table if not exists feeding_intro_progress (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  kind            text not null check (kind in ('allergen', 'texture')),
  item            text not null check (item ~ '^[a-z_]{2,30}$'),
  introduced_on   date not null check (introduced_on between date '2000-01-01' and current_date),
  reaction        text not null default 'none' check (reaction in ('none', 'mild', 'moderate', 'severe')),
  notes           text check (notes is null or length(notes) <= 500),
  recorded_by     uuid references directus_users (id) on delete set null,
  by_guardian     boolean not null default false,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  constraint feeding_intro_texture_no_reaction check (kind = 'allergen' or reaction = 'none'),
  unique (patient_id, kind, item)
);
create index if not exists feeding_intro_progress_patient on feeding_intro_progress (patient_id, kind);

create or replace function feeding_intro_progress_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.kind <> old.kind or new.item <> old.item) then
    raise exception 'O registro não pode mudar de criança ou de item' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  -- Quem registra: owner ou nutricionista do consultório, ou a conta ligada ao paciente (o responsável, pelo app)
  if new.recorded_by is null then
    raise exception 'Registro sem autor' using errcode = 'P0001';
  end if;
  if exists (select 1 from organization_members where organization_id = new.organization_id and user_id = new.recorded_by and role in ('owner', 'nutritionist')) then
    new.by_guardian := false;
  elsif exists (select 1 from patients where id = new.patient_id and app_user_id = new.recorded_by and status = 'active') then
    new.by_guardian := true;
  else
    raise exception 'Só o nutricionista ou o responsável ligado ao app registra a introdução alimentar' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.date_updated := now(); end if;
  return new;
end $$;

drop trigger if exists feeding_intro_progress_guard on feeding_intro_progress;
create trigger feeding_intro_progress_guard before insert or update on feeding_intro_progress for each row execute function feeding_intro_progress_guard();
drop trigger if exists feeding_intro_progress_audit on feeding_intro_progress;
create trigger feeding_intro_progress_audit after insert or update or delete on feeding_intro_progress for each row execute function audit_trigger();

-- ── Responsáveis legais e consentimento ───────────────────────────────────────────────────
create table if not exists patient_guardians (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete cascade,
  patient_id          uuid not null references patients (id) on delete cascade,
  full_name           text not null check (length(btrim(full_name)) between 2 and 120),
  relationship        text not null check (relationship in ('mother', 'father', 'grandparent', 'legal_guardian', 'other')),
  email               text check (email is null or (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254)),
  phone               text check (phone is null or length(phone) <= 30),
  consent_at          timestamptz,
  consent_method      text check (consent_method is null or consent_method in ('in_person', 'signed_form', 'other')),
  consent_recorded_by uuid references directus_users (id) on delete set null,
  notes               text check (notes is null or length(notes) <= 500),
  user_created        uuid references directus_users (id) on delete set null,
  date_created        timestamptz not null default now(),
  date_updated        timestamptz,
  constraint patient_guardians_consent check ((consent_at is null) = (consent_method is null))
);
create index if not exists patient_guardians_patient on patient_guardians (patient_id);

create or replace function patient_guardians_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'O responsável não pode mudar de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  else
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
    end if;
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cadastra responsáveis' using errcode = 'P0001';
    end if;
  end if;
  if new.email is not null then new.email := lower(btrim(new.email)); end if;
  return new;
end $$;

drop trigger if exists patient_guardians_guard on patient_guardians;
create trigger patient_guardians_guard before insert or update on patient_guardians for each row execute function patient_guardians_guard();
drop trigger if exists patient_guardians_audit on patient_guardians;
create trigger patient_guardians_audit after insert or update or delete on patient_guardians for each row execute function audit_trigger();

-- ── Convite do app ao responsável ─────────────────────────────────────────────────────────
alter table patient_app_invites add column if not exists guardian_id uuid references patient_guardians (id) on delete set null;

create or replace function patient_app_invites_guardian_guard() returns trigger language plpgsql as $$
begin
  if new.guardian_id is not null and not exists (
    select 1 from patient_guardians where id = new.guardian_id and patient_id = new.patient_id and consent_at is not null
  ) then
    raise exception 'O responsável precisa ser deste paciente e ter o consentimento registrado' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists patient_app_invites_guardian_guard on patient_app_invites;
create trigger patient_app_invites_guardian_guard before insert on patient_app_invites for each row execute function patient_app_invites_guardian_guard();

-- Um responsável pode ter mais de um filho no mesmo consultório: a conta passa a poder ligar a vários registros.
drop index if exists patients_app_user_org;
create index if not exists patients_app_user_org_idx on patients (organization_id, app_user_id) where app_user_id is not null;

-- ── O que o paciente vê: materno-infantil ─────────────────────────────────────────────────
create or replace function share_settings_valid(s jsonb) returns boolean language sql immutable as $$
  select s is null or (
    jsonb_typeof(s) = 'object'
    and not exists (select 1 from jsonb_object_keys(s) k where k not in ('show_kcal', 'show_macros', 'show_weight_history', 'show_maternal'))
    and not exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) <> 'boolean')
  )
$$;

alter table organizations alter column patient_share_defaults
  set default '{"show_kcal": false, "show_macros": false, "show_weight_history": false, "show_maternal": false}'::jsonb;

create or replace function patient_share(p_patient uuid) returns jsonb language sql stable as $$
  select '{"show_kcal": false, "show_macros": false, "show_weight_history": false, "show_maternal": false}'::jsonb
         || coalesce(o.patient_share_defaults, '{}'::jsonb)
         || coalesce(p.share_settings, '{}'::jsonb)
  from patients p join organizations o on o.id = p.organization_id
  where p.id = p_patient
$$;

-- ── Aviso ao nutricionista: reação na introdução alimentar ────────────────────────────────
alter table notification_outbox drop constraint if exists notification_outbox_kind_check;
alter table notification_outbox add constraint notification_outbox_kind_check check (kind in (
  'appointment_reminder', 'appointment_scheduled', 'appointment_changed', 'appointment_cancelled', 'plan_published', 'patient_invite', 'test',
  'invoice_created', 'invoice_due', 'payment_reported', 'payment_confirmed', 'subscription_ended', 'feeding_reaction'));

insert into schema_migrations (version) values ('0065_maternal_care') on conflict do nothing;

commit;
