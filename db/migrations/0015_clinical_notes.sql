-- RN-023 — Prontuário: evoluções com assinatura e retificação. Idempotente.
-- Lidas e gravadas só pelos endpoints /rafanutri/patients/:id/notes e /rafanutri/notes da extensão
-- (consultório do usuário logado); não há permissão de coleção no Directus para o papel Profissional.
-- Regras no banco:
--   * a evolução nasce como rascunho (sem assinatura) e só o autor (owner/nutricionista) escreve;
--   * assinar grava data, nome e CRN do autor; depois disso nada muda e nada se apaga;
--   * corrigir uma evolução assinada = retificar: nova evolução ligada à original (supersedes_id),
--     do mesmo paciente; cada versão é retificada no máximo uma vez (cadeia de versões).

begin;

create table if not exists clinical_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  appointment_id  uuid references appointments (id) on delete set null,
  body            text not null check (length(trim(body)) between 1 and 20000),
  supersedes_id   uuid references clinical_notes (id) on delete restrict,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  signed_at       timestamptz,
  signer_name     text,
  signer_crn      text
);

create index if not exists clinical_notes_patient on clinical_notes (patient_id, date_created desc);
create unique index if not exists clinical_notes_supersedes on clinical_notes (supersedes_id) where supersedes_id is not null;

create or replace function clinical_notes_guard() returns trigger language plpgsql as $$
declare prev clinical_notes; u record;
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null then
      raise exception 'Evolução assinada não pode ser apagada; faça uma retificação' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório registra evoluções' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.appointment_id is not null and not exists (
      select 1 from appointments where id = new.appointment_id and patient_id = new.patient_id
    ) then
      raise exception 'A consulta não é deste paciente' using errcode = 'P0001';
    end if;
    if new.supersedes_id is not null then
      select * into prev from clinical_notes where id = new.supersedes_id;
      if not found or prev.patient_id <> new.patient_id or prev.organization_id <> new.organization_id then
        raise exception 'A evolução retificada não é deste paciente' using errcode = 'P0001';
      end if;
      if prev.signed_at is null then
        raise exception 'Só evoluções assinadas são retificadas; edite o rascunho' using errcode = 'P0001';
      end if;
    end if;
    -- A assinatura nunca vem pronta do cliente.
    new.signed_at := null; new.signer_name := null; new.signer_crn := null;
    new.date_created := now(); new.date_updated := null;
    new.body := trim(new.body);
    return new;
  end if;

  -- UPDATE
  if old.signed_at is not null then
    raise exception 'Evolução assinada não pode ser alterada; faça uma retificação' using errcode = 'P0001';
  end if;
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.supersedes_id is distinct from old.supersedes_id or new.user_created is distinct from old.user_created
     or new.date_created <> old.date_created then
    raise exception 'A evolução não pode mudar de consultório, paciente, autor ou versão' using errcode = 'P0001';
  end if;
  if new.appointment_id is distinct from old.appointment_id and new.appointment_id is not null and not exists (
    select 1 from appointments where id = new.appointment_id and patient_id = new.patient_id
  ) then
    raise exception 'A consulta não é deste paciente' using errcode = 'P0001';
  end if;
  new.body := trim(new.body);
  new.date_updated := now();
  if new.signed_at is not null then
    -- Assinatura: hora do servidor; nome e CRN do autor, gravados como estavam no momento.
    select coalesce(nullif(trim(concat_ws(' ', du.first_name, du.last_name)), ''), du.email) as name,
           case when pp.crn is not null then concat(coalesce(pp.crn_region, 'CRN'), ' ', pp.crn) end as crn
      into u
      from directus_users du left join professional_profiles pp on pp.user_id = du.id
     where du.id = old.user_created;
    if not found then
      raise exception 'Evolução sem autor não pode ser assinada' using errcode = 'P0001';
    end if;
    new.signed_at := now(); new.signer_name := u.name; new.signer_crn := u.crn;
  else
    new.signer_name := null; new.signer_crn := null;
  end if;
  return new;
end $$;

drop trigger if exists clinical_notes_guard on clinical_notes;
create trigger clinical_notes_guard before insert or update or delete on clinical_notes
  for each row execute function clinical_notes_guard();

insert into schema_migrations (version) values ('0015_clinical_notes') on conflict do nothing;

commit;
