-- RN-153 / RN-154 — Quadro de não conformidades e plano de ação 5W2H. Idempotente.
--
-- Ciclo: aberta → em tratamento (ao ganhar um plano) → resolvida (todos os planos concluídos) → fechada
-- (verificação de eficácia com nota e foto de evidência). Fechada é definitiva. Plano novo numa resolvida
-- volta para "em tratamento". As mudanças de situação são feitas pelos gatilhos e pela função nc_close.

begin;

alter table non_conformities add column if not exists closing_note text check (closing_note is null or char_length(closing_note) <= 2000);
alter table non_conformities add column if not exists closing_photo uuid references directus_files (id) on delete set null;

create table if not exists action_plans (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  non_conformity_id uuid not null references non_conformities (id) on delete cascade,
  what              text not null check (char_length(btrim(what)) between 3 and 500),
  why               text check (why is null or char_length(why) <= 1000),
  where_            text check (where_ is null or char_length(where_) <= 200),
  due_date          date not null,
  who_user          uuid references directus_users (id) on delete set null,
  who_text          text check (who_text is null or char_length(who_text) <= 120),
  how               text check (how is null or char_length(how) <= 1000),
  how_much_cents    integer check (how_much_cents is null or how_much_cents between 0 and 100000000),
  status            text not null default 'planned' check (status in ('planned', 'done')),
  done_note         text check (done_note is null or char_length(done_note) <= 1000),
  done_by           uuid references directus_users (id) on delete set null,
  done_at           timestamptz,
  created_by        uuid references directus_users (id) on delete set null,
  created_at        timestamptz not null default now(),
  check (who_user is not null or who_text is not null)
);
create index if not exists action_plans_nc on action_plans (non_conformity_id, created_at);

-- Plano: organização vem da NC; não entra em NC fechada; concluído não volta.
create or replace function action_plans_guard() returns trigger language plpgsql as $$
declare nc non_conformities;
begin
  select * into nc from non_conformities where id = coalesce(new.non_conformity_id, old.non_conformity_id);
  if tg_op = 'DELETE' then
    if nc.id is null then return old; end if;
    if old.status = 'done' or nc.status = 'closed' then
      raise exception 'Plano concluído ou de não conformidade fechada não se apaga' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if nc.status = 'closed' then raise exception 'Não conformidade fechada não recebe mudanças' using errcode = 'P0001'; end if;
  if tg_op = 'INSERT' then
    new.organization_id := nc.organization_id;
    new.status := 'planned'; new.done_at := null; new.done_by := null; new.done_note := null;
    new.created_at := now();
    return new;
  end if;
  if new.non_conformity_id <> old.non_conformity_id or new.organization_id <> old.organization_id then
    raise exception 'O plano não muda de não conformidade' using errcode = 'P0001';
  end if;
  if old.status = 'done' then raise exception 'Plano concluído não se altera' using errcode = 'P0001'; end if;
  if new.status = 'done' then new.done_at := now(); end if;
  return new;
end $$;
drop trigger if exists action_plans_guard on action_plans;
create trigger action_plans_guard before insert or update or delete on action_plans
  for each row execute function action_plans_guard();

-- Situação da NC acompanha os planos.
create or replace function action_plans_sync_nc() returns trigger language plpgsql security definer set search_path = public as $$
declare ncid uuid := coalesce(new.non_conformity_id, old.non_conformity_id); pending integer; total integer;
begin
  select count(*) filter (where status = 'planned'), count(*) into pending, total from action_plans where non_conformity_id = ncid;
  perform set_config('rafanutri.nc_sync', 'on', true);
  update non_conformities set status = case when total = 0 then 'open' when pending > 0 then 'in_progress' else 'resolved' end
   where id = ncid and status <> 'closed';
  perform set_config('rafanutri.nc_sync', 'off', true);
  return null;
end $$;
drop trigger if exists action_plans_sync_nc on action_plans;
create trigger action_plans_sync_nc after insert or update or delete on action_plans
  for each row execute function action_plans_sync_nc();

-- NC: origem imutável; fechada é definitiva; situação só pelos planos ou por nc_close.
create or replace function non_conformities_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    new.opened_at := now();
    new.due_at := coalesce(new.due_at, nc_due(new.severity));
    new.status := 'open';
    new.closed_at := null; new.closed_by := null; new.closing_note := null; new.closing_photo := null;
    return new;
  end if;
  if old.status = 'closed' then
    raise exception 'Não conformidade fechada não recebe mudanças' using errcode = 'P0001';
  end if;
  if new.organization_id <> old.organization_id or new.unit_id <> old.unit_id or new.source <> old.source
     or new.run_id is distinct from old.run_id or new.opened_at <> old.opened_at
     or new.equipment_id is distinct from old.equipment_id then
    raise exception 'Origem da não conformidade não muda' using errcode = 'P0001';
  end if;
  if new.status <> old.status then
    if new.status = 'closed' and current_setting('rafanutri.nc_close', true) is distinct from 'on' then
      raise exception 'Use nc_close para fechar' using errcode = 'P0001';
    end if;
    if new.status <> 'closed' and current_setting('rafanutri.nc_sync', true) is distinct from 'on' then
      raise exception 'A situação acompanha os planos de ação' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'closed' then new.closed_at := now(); end if;
  return new;
end $$;

/** Fecha a NC: exige planos concluídos (situação "resolvida"), nota de verificação e foto de evidência. */
create or replace function nc_close(p_nc uuid, p_user uuid, p_note text, p_photo uuid) returns non_conformities
language plpgsql security definer set search_path = public as $$
declare nc non_conformities;
begin
  select * into nc from non_conformities where id = p_nc for update;
  if nc.id is null then raise exception 'Não conformidade não encontrada' using errcode = 'P0001'; end if;
  if nc.status = 'closed' then raise exception 'Não conformidade já fechada' using errcode = 'P0001'; end if;
  if nc.status <> 'resolved' then
    raise exception 'Conclua os planos de ação antes de fechar' using errcode = 'P0001';
  end if;
  if p_photo is null then raise exception 'Anexe a foto da evidência para fechar' using errcode = 'P0001'; end if;
  if nullif(btrim(p_note), '') is null then raise exception 'Descreva a verificação de eficácia' using errcode = 'P0001'; end if;
  perform set_config('rafanutri.nc_close', 'on', true);
  update non_conformities set status = 'closed', closed_by = p_user, closing_note = left(btrim(p_note), 2000), closing_photo = p_photo
   where id = p_nc returning * into nc;
  perform set_config('rafanutri.nc_close', 'off', true);
  return nc;
end $$;

drop trigger if exists action_plans_audit on action_plans;
create trigger action_plans_audit after insert or update or delete on action_plans
  for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0037_action_plans') on conflict do nothing;

commit;
