-- U6a — Documentos de Boas Práticas (RN-155, RN-156, RN-158) e treinamentos (RN-159). Idempotente.
--
-- Decisões:
-- - Documento por unidade (POP, manual ou outro), com versões em Markdown. Rascunho é editável; aprovada é
--   imutável e guarda o hash SHA-256 do texto (integridade, RN-167) e a próxima revisão.
-- - Aprovar: RT da unidade ou owner (doc_version_approve). Nova versão parte do texto da última aprovada.
-- - Ciência: cada pessoa da equipe confirma a leitura da versão vigente (document_acknowledgements).
-- - Treinamentos por unidade com participantes da equipe (ou nome livre, para quem não tem conta).

begin;


create table if not exists quality_documents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete cascade,
  unit_id             uuid not null references production_units (id) on delete cascade,
  kind                text not null default 'pop' check (kind in ('pop', 'manual', 'other')),
  code                text check (code is null or code ~ '^[a-z0-9-]{2,60}$'),
  title               text not null check (char_length(btrim(title)) between 3 and 160),
  review_every_months integer not null default 12 check (review_every_months between 1 and 60),
  archived            boolean not null default false,
  created_by          uuid references directus_users (id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists quality_documents_unit on quality_documents (unit_id, archived, kind);

create table if not exists quality_document_versions (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references quality_documents (id) on delete cascade,
  version        integer not null check (version >= 1),
  body_md        text not null check (char_length(body_md) between 1 and 100000),
  change_summary text check (change_summary is null or char_length(change_summary) <= 500),
  status         text not null default 'draft' check (status in ('draft', 'approved')),
  content_hash   text,
  next_review_on date,
  approved_by    uuid references directus_users (id) on delete set null,
  approved_at    timestamptz,
  created_by     uuid references directus_users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (document_id, version)
);
create unique index if not exists quality_document_versions_one_draft on quality_document_versions (document_id) where status = 'draft';

create table if not exists document_acknowledgements (
  version_id      uuid not null references quality_document_versions (id) on delete cascade,
  user_id         uuid not null references directus_users (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (version_id, user_id)
);

create table if not exists trainings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  topic           text not null check (char_length(btrim(topic)) between 3 and 200),
  held_on         date not null,
  hours           numeric(5, 1) not null check (hours > 0 and hours <= 200),
  instructor      text check (instructor is null or char_length(instructor) <= 120),
  notes           text check (notes is null or char_length(notes) <= 1000),
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists trainings_unit on trainings (unit_id, held_on desc);

create table if not exists training_attendees (
  id          bigserial primary key,
  training_id uuid not null references trainings (id) on delete cascade,
  user_id     uuid references directus_users (id) on delete set null,
  name        text check (name is null or char_length(btrim(name)) between 2 and 120),
  check (user_id is not null or name is not null)
);
create unique index if not exists training_attendees_user on training_attendees (training_id, user_id) where user_id is not null;

-- Documento e treinamento: organização vem da unidade; módulo UAN.
create or replace function uan_unit_row_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.unit_id <> old.unit_id then
    raise exception 'O registro não muda de unidade' using errcode = 'P0001';
  end if;
  new.organization_id := (select organization_id from production_units where id = new.unit_id);
  if not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists quality_documents_guard on quality_documents;
create trigger quality_documents_guard before insert or update on quality_documents for each row execute function uan_unit_row_guard();
drop trigger if exists trainings_guard on trainings;
create trigger trainings_guard before insert or update on trainings for each row execute function uan_unit_row_guard();

-- Versão: aprovada é imutável (texto, hash, datas); só pela função de aprovação vira aprovada.
create or replace function quality_document_versions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.content_hash := null; new.approved_by := null; new.approved_at := null; new.next_review_on := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'approved' and exists (select 1 from quality_documents where id = old.document_id) then
      raise exception 'Versão aprovada não se apaga' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.status = 'approved' then
    if (to_jsonb(new) - 'approved_by' - 'created_by') = (to_jsonb(old) - 'approved_by' - 'created_by') then return new; end if; -- FK set null
    raise exception 'Versão aprovada não se altera; crie uma nova versão' using errcode = 'P0001';
  end if;
  if new.document_id <> old.document_id or new.version <> old.version then
    raise exception 'A versão não muda de documento' using errcode = 'P0001';
  end if;
  if new.status = 'approved' and current_setting('rafanutri.doc_approve', true) is distinct from 'on' then
    raise exception 'Use a aprovação do documento' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists quality_document_versions_guard on quality_document_versions;
create trigger quality_document_versions_guard before insert or update or delete on quality_document_versions for each row execute function quality_document_versions_guard();

/** Aprova o rascunho: RT da unidade ou owner; grava o hash SHA-256 do texto e a próxima revisão. */
create or replace function doc_version_approve(p_version uuid, p_user uuid) returns quality_document_versions
language plpgsql security definer set search_path = public as $$
declare v quality_document_versions; d quality_documents;
begin
  select * into v from quality_document_versions where id = p_version for update;
  if v.id is null or v.status <> 'draft' then raise exception 'Só rascunho pode ser aprovado' using errcode = 'P0001'; end if;
  select * into d from quality_documents where id = v.document_id;
  if not exists (select 1 from organization_members where organization_id = d.organization_id and user_id = p_user and role = 'owner')
     and not exists (select 1 from unit_members where unit_id = d.unit_id and user_id = p_user and role = 'technical_lead') then
    raise exception 'Só o RT da unidade ou o responsável pela empresa aprovam documentos' using errcode = 'P0001';
  end if;
  perform set_config('rafanutri.doc_approve', 'on', true);
  update quality_document_versions
     set status = 'approved', approved_by = p_user, approved_at = now(),
         content_hash = encode(sha256(convert_to(body_md, 'UTF8')), 'hex'),
         next_review_on = (current_date + make_interval(months => d.review_every_months))::date
   where id = v.id returning * into v;
  perform set_config('rafanutri.doc_approve', 'off', true);
  return v;
end $$;

/** Versão vigente de cada documento: a aprovada de maior número. */
create or replace view quality_document_current as
  select distinct on (v.document_id) v.document_id, v.id as version_id, v.version, v.approved_at, v.next_review_on, v.content_hash
    from quality_document_versions v where v.status = 'approved' order by v.document_id, v.version desc;

do $$
declare t text;
begin
  foreach t in array array['quality_documents', 'trainings'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0048_quality_docs') on conflict do nothing;

commit;
