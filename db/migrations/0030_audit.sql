-- RN-009 — Auditoria de tabelas sensíveis e registro de leitura do prontuário. Idempotente.
-- Regras no banco:
--   * audit_trigger() (AFTER, security definer) grava em audit_logs inserções, alterações e exclusões das
--     tabelas clínicas e financeiras: autor, ação, entidade, id, paciente e a LISTA de campos alterados
--     (nunca os valores — dado clínico não vai para o log);
--   * o autor vem da variável de sessão rafanutri.actor (endpoints da extensão) ou, na inserção, de
--     user_created. Escritas pela API de itens do Directus ficam sem autor aqui e o endpoint /audit o
--     resolve pelo directus_activity (mesma coleção, item e ação, no mesmo minuto);
--   * log_access() registra leitura e exportação (prontuário, documentos, recibos);
--   * repetição igual (mesmo autor, entidade, ação e campos) em até 10 minutos não gera nova linha
--     (salvamento automático de rascunho, reabrir a mesma aba);
--   * audit_logs não muda nem é apagado; só some junto com o consultório (cascata).
-- Lido só pelo endpoint GET /rafanutri/audit (owner). Sem coleção no Directus: nenhum papel lê pela API.
-- Retenção: indefinida até a decisão do jurídico (docs/seguranca/auditoria.md).

begin;

create table if not exists audit_logs (
  id              bigserial primary key,
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_id        uuid,
  action          text not null check (action in ('insert', 'update', 'delete', 'read', 'export')),
  entity          text not null check (length(entity) between 1 and 60),
  entity_id       text not null check (length(entity_id) between 1 and 64),
  patient_id      uuid,
  changed_fields  text[],
  occurred_at     timestamptz not null default now()
);
create index if not exists audit_logs_org_time on audit_logs (organization_id, occurred_at desc);
create index if not exists audit_logs_entity on audit_logs (entity, entity_id, occurred_at desc);

create or replace function audit_logs_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from organizations where id = old.organization_id) then
    return old;
  end if;
  raise exception 'O registro de auditoria não pode ser alterado nem apagado' using errcode = 'P0001';
end $$;
drop trigger if exists audit_logs_guard on audit_logs;
create trigger audit_logs_guard before update or delete on audit_logs for each row execute function audit_logs_guard();

/** Grava uma linha, salvo se a mesma (autor, entidade, ação, campos) já entrou nos últimos 10 minutos. */
create or replace function audit_write(org uuid, actor uuid, act text, ent text, ent_id text, pat uuid, fields text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from audit_logs
     where entity = ent and entity_id = ent_id and action = act and actor_id is not distinct from actor
       and changed_fields is not distinct from fields and occurred_at > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into audit_logs (organization_id, actor_id, action, entity, entity_id, patient_id, changed_fields)
  values (org, actor, act, ent, ent_id, pat, fields);
end $$;

create or replace function audit_actor() returns uuid language plpgsql stable as $$
declare v text := nullif(current_setting('rafanutri.actor', true), '');
begin
  return case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end;
end $$;

create or replace function audit_trigger() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb; o jsonb; fields text[]; org uuid; pat uuid; actor uuid := audit_actor();
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  org := (r ->> 'organization_id')::uuid;
  if org is null then return null; end if;
  -- consultório sendo apagado (cascata): nada a registrar
  if tg_op = 'DELETE' and not exists (select 1 from organizations where id = org) then return null; end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    select array_agg(k order by k) into fields
      from jsonb_object_keys(r) k
     where r -> k is distinct from o -> k and k not in ('date_updated', 'updated_at', 'user_updated', 'search_name');
    if fields is null then return null; end if;
  end if;
  if tg_op = 'INSERT' and actor is null and r ? 'user_created' then
    actor := nullif(r ->> 'user_created', '')::uuid;
  end if;
  pat := case when tg_table_name = 'patients' then (r ->> 'id')::uuid else nullif(r ->> 'patient_id', '')::uuid end;
  perform audit_write(org, actor, lower(tg_op), tg_table_name, coalesce(r ->> 'id', r ->> 'user_id'), pat, fields);
  return null;
end $$;

/** Leitura ou exportação registrada pelos endpoints (prontuário, documentos, recibos). */
create or replace function log_access(org uuid, actor uuid, ent text, ent_id text, pat uuid default null, act text default 'read')
returns void language plpgsql security definer set search_path = public as $$
begin
  if act not in ('read', 'export') then
    raise exception 'Ação de acesso inválida' using errcode = 'P0001';
  end if;
  perform audit_write(org, actor, act, ent, ent_id, pat, null);
end $$;

do $$
declare t text;
begin
  foreach t in array array['patients', 'clinical_notes', 'anamneses', 'anthropometric_assessments', 'meal_plans',
                           'clinical_documents', 'appointments', 'financial_transactions', 'receipts',
                           'organization_members', 'patient_app_invites', 'patient_recommendations', 'patient_packages'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

-- Busca do autor das escritas pela API de itens (só quando as tabelas do Directus existem)
do $$
begin
  if to_regclass('directus_activity') is not null then
    execute 'create index if not exists rafanutri_activity_item on directus_activity (collection, item, "timestamp")';
  end if;
end $$;

insert into schema_migrations (version) values ('0030_audit') on conflict do nothing;

commit;
