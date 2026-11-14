-- RN-215 — Documentos clínicos com a marca (pedido de exames, prescrição de suplementos, declaração de
-- comparecimento, orientações gerais) e modelos reutilizáveis por consultório. Idempotente.
-- Lidos e gravados só pelos endpoints /rafanutri da extensão; nenhum papel do Directus tem permissão de coleção.
-- Regras no banco:
--   * só owner/nutricionista do consultório cria, para paciente ativo do consultório; o autor não muda;
--   * rascunho não aparece ao paciente (o endpoint só lê publicados); publicar grava published_at,
--     voltar para rascunho apaga;
--   * pedido de exames precisa de ao menos um exame ou de texto; os demais tipos precisam de texto;
--   * o PDF é gerado na hora (não há arquivo guardado).

begin;

create or replace function clinical_exams_valid(e jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(e) = 'array' and jsonb_array_length(e) <= 60
     and not exists (select 1 from jsonb_array_elements(e) x
                     where jsonb_typeof(x) <> 'string' or length(trim(x #>> '{}')) not between 2 and 120)
$$;

create table if not exists clinical_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  kind            text not null check (kind in ('exam_request', 'supplement_prescription', 'attendance_declaration', 'general_guidance')),
  title           text not null check (length(trim(title)) between 2 and 120),
  body            text not null default '' check (length(body) <= 6000),
  exams           jsonb not null default '[]'::jsonb check (clinical_exams_valid(exams)),
  document_date   date not null default current_date,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  check (case when kind = 'exam_request' then jsonb_array_length(exams) > 0 or length(trim(body)) >= 2
              else length(trim(body)) >= 2 end),
  check (kind = 'exam_request' or jsonb_array_length(exams) = 0)
);

create index if not exists clinical_documents_patient on clinical_documents (patient_id, status);
create index if not exists clinical_documents_org on clinical_documents (organization_id);

create or replace function clinical_documents_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria documentos' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem documentos' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.kind <> old.kind
       or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
      raise exception 'O documento não muda de paciente, de tipo nem de autor' using errcode = 'P0001';
    end if;
    if new.status = 'published' and old.status = 'draft' then
      new.published_at := now();
    elsif new.status = 'draft' then
      new.published_at := null;
    else
      new.published_at := old.published_at;
    end if;
    new.date_updated := now();
  end if;
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $$;

drop trigger if exists clinical_documents_guard on clinical_documents;
create trigger clinical_documents_guard before insert or update on clinical_documents
  for each row execute function clinical_documents_guard();

-- Modelos do consultório (sem paciente)
create table if not exists clinical_document_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  kind            text not null check (kind in ('exam_request', 'supplement_prescription', 'attendance_declaration', 'general_guidance')),
  title           text not null check (length(trim(title)) between 2 and 120),
  body            text not null default '' check (length(body) <= 6000),
  exams           jsonb not null default '[]'::jsonb check (clinical_exams_valid(exams)),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  check (jsonb_array_length(exams) > 0 or length(trim(body)) >= 2),
  check (kind = 'exam_request' or jsonb_array_length(exams) = 0)
);

create index if not exists clinical_document_templates_org on clinical_document_templates (organization_id, kind);

create or replace function clinical_document_templates_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
  else
    if new.organization_id <> old.organization_id or new.kind <> old.kind then
      raise exception 'O modelo não muda de consultório nem de tipo' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $$;

drop trigger if exists clinical_document_templates_guard on clinical_document_templates;
create trigger clinical_document_templates_guard before insert or update on clinical_document_templates
  for each row execute function clinical_document_templates_guard();

insert into schema_migrations (version) values ('0023_clinical_documents') on conflict do nothing;

commit;
