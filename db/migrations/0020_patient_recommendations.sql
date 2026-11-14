-- RN-208 — Recomendações ao paciente. Idempotente.
-- Regras no banco:
--   * só owner/nutricionista do consultório cria, para paciente ativo do consultório;
--   * rascunho não aparece ao paciente (o endpoint só lê publicadas); publicar grava published_at;
--   * read_at só é gravado pelo endpoint do paciente (variável de sessão rafanutri.patient_read), uma vez,
--     só em recomendação publicada e sem mudar mais nada. O profissional nunca mexe em read_at;
--   * editar título ou texto de uma publicada, ou voltar para rascunho, zera a leitura (o paciente vê como nova).

begin;

create table if not exists patient_recommendations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  category        text not null check (length(trim(category)) between 2 and 40),
  title           text not null check (length(trim(title)) between 2 and 120),
  body            text not null check (length(trim(body)) between 2 and 4000),
  pinned          boolean not null default false,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  read_at         timestamptz,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create index if not exists patient_recommendations_patient on patient_recommendations (patient_id, status);
create index if not exists patient_recommendations_org on patient_recommendations (organization_id);

create or replace function patient_recommendations_guard() returns trigger language plpgsql as $$
declare
  reading boolean := coalesce(current_setting('rafanutri.patient_read', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria recomendações' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem recomendações' using errcode = 'P0001';
    end if;
    new.read_at := null;
    new.date_created := now();
    new.date_updated := null;
    new.published_at := case when new.status = 'published' then now() else null end;
    return new;
  end if;

  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
    raise exception 'A recomendação não muda de paciente nem de autor' using errcode = 'P0001';
  end if;

  if new.read_at is distinct from old.read_at then
    -- leitura: só pelo endpoint do paciente, uma vez, em publicada, sem mudar mais nada
    if not reading then
      raise exception 'A leitura só é marcada pelo paciente' using errcode = 'P0001';
    end if;
    if old.read_at is not null or new.read_at is null or old.status <> 'published'
       or new.category <> old.category or new.title <> old.title or new.body <> old.body
       or new.pinned <> old.pinned or new.status <> old.status or new.published_at is distinct from old.published_at then
      raise exception 'Leitura inválida' using errcode = 'P0001';
    end if;
    new.date_updated := old.date_updated;
    return new;
  end if;

  if reading then
    raise exception 'O paciente só marca a leitura' using errcode = 'P0001';
  end if;

  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
    new.read_at := null;
  elsif new.status = 'draft' then
    new.published_at := null;
    new.read_at := null;
  else
    new.published_at := old.published_at;
    if new.title <> old.title or new.body <> old.body then
      new.read_at := null;
    end if;
  end if;
  new.date_updated := now();
  return new;
end $$;

drop trigger if exists patient_recommendations_guard on patient_recommendations;
create trigger patient_recommendations_guard before insert or update on patient_recommendations
  for each row execute function patient_recommendations_guard();

insert into schema_migrations (version) values ('0020_patient_recommendations') on conflict do nothing;

commit;
