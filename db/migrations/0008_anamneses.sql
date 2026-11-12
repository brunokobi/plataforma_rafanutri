-- RN-024 a RN-026 — Questionários (modelos) e anamneses por paciente. Idempotente.
-- Regras no banco (ADR 0008, regra 3):
--   * modelo padrão da plataforma (organization_id nulo) não é alterado por consultórios;
--   * modelo do consultório: autor owner/nutricionista; versão sobe a cada mudança do conteúdo;
--   * anamnese guarda a CÓPIA do questionário no envio (schema_snapshot): mudar o modelo não
--     altera anamneses já enviadas;
--   * o link público usa só o hash do token (sha256 em hex), com validade; após a resposta o hash
--     é apagado (o link deixa de funcionar);
--   * respostas só mudam enquanto a anamnese está "enviada" (rascunho do paciente) e quem grava é
--     a extensão pública; respondida não volta a enviada.

begin;

create table if not exists questionnaire_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,   -- nulo = modelo padrão
  name            text not null check (length(trim(name)) between 2 and 120),
  description     text check (description is null or length(description) <= 500),
  schema          jsonb not null check (jsonb_typeof(schema) = 'object' and jsonb_typeof(schema -> 'sections') = 'array'),
  version         integer not null default 1,
  is_active       boolean not null default true,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create index if not exists questionnaire_templates_org on questionnaire_templates (organization_id);

create or replace function questionnaire_templates_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is not null and new.user_created is not null and not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos' using errcode = 'P0001';
    end if;
    new.version := 1;
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'O modelo não pode mudar de consultório' using errcode = 'P0001';
  end if;
  if new.schema is distinct from old.schema then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.date_updated := now();
  return new;
end $$;

drop trigger if exists questionnaire_templates_guard on questionnaire_templates;
create trigger questionnaire_templates_guard before insert or update on questionnaire_templates
  for each row execute function questionnaire_templates_guard();

create table if not exists anamneses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  patient_id       uuid not null references patients (id) on delete cascade,
  template_id      uuid references questionnaire_templates (id) on delete set null,
  template_version integer,
  title            text,
  schema_snapshot  jsonb,
  answers          jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status           text not null default 'sent' check (status in ('sent', 'answered', 'reviewed', 'cancelled')),
  public_token_hash text unique check (public_token_hash is null or public_token_hash ~ '^[0-9a-f]{64}$'),
  token_expires_at timestamptz,
  answered_at      timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references directus_users (id) on delete set null,
  user_created     uuid references directus_users (id) on delete set null,
  date_created     timestamptz not null default now(),
  date_updated     timestamptz
);

create index if not exists anamneses_patient on anamneses (patient_id, date_created desc);
create index if not exists anamneses_org_status on anamneses (organization_id, status);

create or replace function anamneses_guard() returns trigger language plpgsql as $$
declare t questionnaire_templates;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'sent' then
      raise exception 'A anamnese nasce como enviada' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório envia anamneses' using errcode = 'P0001';
    end if;
    select * into t from questionnaire_templates where id = new.template_id;
    if not found or (t.organization_id is not null and t.organization_id <> new.organization_id) or not t.is_active then
      raise exception 'Modelo de questionário indisponível para este consultório' using errcode = 'P0001';
    end if;
    -- Cópia do questionário no envio (o cliente não manda o conteúdo).
    new.schema_snapshot := t.schema;
    new.template_version := t.version;
    new.title := coalesce(nullif(trim(new.title), ''), t.name);
    new.answers := '{}'::jsonb;
    new.answered_at := null; new.reviewed_at := null; new.reviewed_by := null;
    if new.public_token_hash is null then
      raise exception 'Anamnese enviada precisa de link' using errcode = 'P0001';
    end if;
    new.token_expires_at := least(coalesce(new.token_expires_at, now() + interval '7 days'), now() + interval '30 days');
    return new;
  end if;

  -- UPDATE
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.template_id is distinct from old.template_id or new.schema_snapshot is distinct from old.schema_snapshot
     or new.template_version is distinct from old.template_version then
    raise exception 'A anamnese não pode mudar de consultório, paciente ou questionário' using errcode = 'P0001';
  end if;
  if new.answers is distinct from old.answers and old.status <> 'sent' then
    raise exception 'Anamnese já respondida não pode ter as respostas alteradas' using errcode = 'P0001';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'sent' and new.status in ('answered', 'cancelled'))
         or (old.status = 'answered' and new.status = 'reviewed')) then
      raise exception 'Mudança de situação inválida: % → %', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'answered' then new.answered_at := now(); new.public_token_hash := null; end if;
    if new.status = 'cancelled' then new.public_token_hash := null; end if;
    if new.status = 'reviewed' then new.reviewed_at := now(); end if;
  end if;
  new.date_updated := now();
  return new;
end $$;

drop trigger if exists anamneses_guard on anamneses;
create trigger anamneses_guard before insert or update on anamneses
  for each row execute function anamneses_guard();

insert into schema_migrations (version) values ('0008_anamneses') on conflict do nothing;

commit;
