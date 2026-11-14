-- RN-056 — CRM: leads, etapa do paciente no ciclo de vida, eventos e retornos. Idempotente.
-- Decisões:
--   * lead fica em tabela própria (não ocupa vaga do plano gratuito); vira paciente ao converter;
--   * a etapa do paciente (agendado → 1ª consulta → acompanhamento → inativo) é calculada pelo banco a partir das
--     consultas; 90 dias sem consulta e sem nada marcado = inativo (crm_mark_inactive, chamada pelos endpoints);
--   * toda mudança de etapa (lead ou paciente) gera um crm_events; lead "perdido" exige motivo (vai na nota).

begin;

alter table patients add column if not exists crm_stage text;
alter table patients add column if not exists return_interval_days integer not null default 30;
alter table patients add column if not exists lead_source text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'patients_crm_stage_check') then
    alter table patients add constraint patients_crm_stage_check check (crm_stage is null or crm_stage in ('scheduled', 'first_visit', 'follow_up', 'inactive'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_return_interval_check') then
    alter table patients add constraint patients_return_interval_check check (return_interval_days between 7 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_lead_source_check') then
    alter table patients add constraint patients_lead_source_check check (lead_source is null or lead_source in ('instagram', 'referral', 'google', 'site', 'whatsapp', 'other'));
  end if;
end $$;

create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  phone           text check (phone is null or phone ~ '^\+[1-9]\d{7,14}$'),
  email           text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source          text not null default 'other' check (source in ('instagram', 'referral', 'google', 'site', 'whatsapp', 'other')),
  stage           text not null default 'new' check (stage in ('new', 'contacted', 'lost', 'converted')),
  lost_reason     text check (lost_reason is null or length(lost_reason) between 2 and 300),
  notes           text check (notes is null or length(notes) <= 500),
  patient_id      uuid references patients (id) on delete set null,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  check (stage <> 'lost' or lost_reason is not null)
);
create index if not exists leads_org_stage on leads (organization_id, stage);

create table if not exists crm_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references organizations (id) on delete cascade,
  lead_id         uuid references leads (id) on delete cascade,
  patient_id      uuid references patients (id) on delete cascade,
  from_stage      text,
  to_stage        text not null,
  note            text check (note is null or length(note) <= 300),
  auto            boolean not null default false,
  user_id         uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (lead_id is not null or patient_id is not null)
);
create index if not exists crm_events_org_time on crm_events (organization_id, created_at desc);

create or replace function leads_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created) then
      raise exception 'Só membros do consultório cadastram leads' using errcode = 'P0001';
    end if;
    if new.stage not in ('new', 'contacted') then
      raise exception 'Lead começa como novo ou em contato' using errcode = 'P0001';
    end if;
    new.date_created := now();
  else
    if new.organization_id <> old.organization_id or new.user_created is distinct from old.user_created then
      raise exception 'O lead não muda de consultório nem de autor' using errcode = 'P0001';
    end if;
    if old.stage = 'converted' and new.stage <> 'converted' then
      raise exception 'Lead convertido não volta' using errcode = 'P0001';
    end if;
    if new.stage = 'converted' and (new.patient_id is null or not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id)) then
      raise exception 'Lead convertido precisa do paciente do consultório' using errcode = 'P0001';
    end if;
    if new.stage <> 'lost' then
      new.lost_reason := null;
    end if;
    new.date_updated := now();
  end if;
  new.full_name := trim(new.full_name);
  return new;
end $$;
drop trigger if exists leads_guard on leads;
create trigger leads_guard before insert or update on leads for each row execute function leads_guard();

create or replace function leads_events() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into crm_events (organization_id, lead_id, patient_id, from_stage, to_stage, note, user_id)
    values (new.organization_id, new.id, new.patient_id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            case when new.stage = 'lost' then new.lost_reason end,
            coalesce(nullif(current_setting('rafanutri.actor', true), '')::uuid, new.user_created));
  end if;
  return null;
end $$;
drop trigger if exists leads_events on leads;
create trigger leads_events after insert or update of stage on leads for each row execute function leads_events();

/** Etapa do paciente a partir das consultas (null = ainda sem consulta). */
create or replace function crm_patient_stage(pid uuid) returns text language sql stable as $$
  select case
    when exists (select 1 from appointments where patient_id = pid and status = 'completed' and type = 'return') then 'follow_up'
    when exists (select 1 from appointments where patient_id = pid and status = 'completed') then
      case when exists (select 1 from appointments where patient_id = pid and status = 'completed' and type = 'first') then 'first_visit' else 'follow_up' end
    when exists (select 1 from appointments where patient_id = pid and status in ('scheduled', 'confirmed')) then 'scheduled'
    else null
  end
$$;

/** Recalcula a etapa e registra o evento automático quando muda. */
create or replace function crm_refresh_patient(pid uuid) returns void language plpgsql as $$
declare
  p patients;
  stage text;
begin
  select * into p from patients where id = pid;
  if p.id is null then return; end if;
  stage := crm_patient_stage(pid);
  -- inativo só sai quando surge consulta nova (agendada) ou concluída depois
  if p.crm_stage = 'inactive' and not exists (
    select 1 from appointments where patient_id = pid and status in ('scheduled', 'confirmed', 'completed')
      and starts_at > coalesce((select max(created_at) from crm_events where patient_id = pid and to_stage = 'inactive'), '-infinity')
  ) then
    return;
  end if;
  if stage is distinct from p.crm_stage and stage is not null then
    update patients set crm_stage = stage where id = pid;
    insert into crm_events (organization_id, patient_id, from_stage, to_stage, auto) values (p.organization_id, pid, p.crm_stage, stage, true);
  end if;
end $$;

create or replace function appointments_crm() returns trigger language plpgsql as $$
begin
  perform crm_refresh_patient(coalesce(new.patient_id, old.patient_id));
  return null;
end $$;
drop trigger if exists appointments_crm on appointments;
create trigger appointments_crm after insert or update of status, type, starts_at or delete on appointments
  for each row execute function appointments_crm();

/** Pacientes ativos com última consulta concluída há mais de 90 dias e nada marcado → inativo. Devolve quantos. */
create or replace function crm_mark_inactive(org uuid) returns integer language plpgsql as $$
declare n integer := 0; r record;
begin
  for r in
    select p.id, p.crm_stage from patients p
     where p.organization_id = org and p.status = 'active' and p.crm_stage in ('first_visit', 'follow_up')
       and not exists (select 1 from appointments a where a.patient_id = p.id and a.status in ('scheduled', 'confirmed'))
       and (select max(a.starts_at) from appointments a where a.patient_id = p.id and a.status = 'completed') < now() - interval '90 days'
  loop
    update patients set crm_stage = 'inactive' where id = r.id;
    insert into crm_events (organization_id, patient_id, from_stage, to_stage, note, auto) values (org, r.id, r.crm_stage, 'inactive', '90 dias sem consulta', true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Etapa atual dos pacientes que já existem (sem eventos retroativos)
update patients p set crm_stage = crm_patient_stage(p.id) where p.crm_stage is null and crm_patient_stage(p.id) is not null;

insert into schema_migrations (version) values ('0027_crm') on conflict do nothing;

commit;
