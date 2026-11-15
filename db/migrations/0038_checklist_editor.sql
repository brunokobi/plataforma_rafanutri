-- RN-147 (editor e cópia de modelos) e RN-150 (agenda de checklists, sem avisos). Idempotente.
--
-- Decisões:
-- - Modelos da plataforma são só leitura: o banco recusa alterar ou apagar o modelo e os itens dele
--   (exceto pela função de carga, com rafanutri.seed = on). Para personalizar, copia-se para a organização.
-- - A cópia guarda a origem (source_template_id). Editar itens de um modelo da organização não muda
--   execuções já feitas (os itens são copiados no início da execução, 0035).
-- - Agenda por unidade: dias da semana (ISO 1 = segunda … 7 = domingo), horário e tolerância. A situação
--   do dia (feito, pendente, atrasado) é calculada na consulta, pelo fuso de São Paulo; não há job.

begin;

alter table checklist_templates add column if not exists source_template_id uuid references checklist_templates (id) on delete set null;

-- Modelos e itens da plataforma: só leitura.
create or replace function checklist_platform_guard() returns trigger language plpgsql as $$
declare org uuid; tid uuid;
begin
  if current_setting('rafanutri.seed', true) = 'on' then return coalesce(new, old); end if;
  if tg_table_name = 'checklist_templates' then
    org := case when tg_op = 'INSERT' then new.organization_id else old.organization_id end;
    if tg_op <> 'INSERT' and org is null then
      raise exception 'Modelo da biblioteca é só leitura; copie para a sua empresa para personalizar' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' and new.organization_id is null then
      raise exception 'Modelos da biblioteca são criados só pela carga da plataforma' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and (new.organization_id is distinct from old.organization_id) then
      raise exception 'O modelo não muda de empresa' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return coalesce(new, old);
  end if;
  tid := case when tg_op = 'DELETE' then old.template_id else new.template_id end;
  select organization_id into org from checklist_templates where id = tid;
  if not found then return coalesce(new, old); end if; -- modelo sendo apagado (cascata)
  if org is null then
    raise exception 'Modelo da biblioteca é só leitura; copie para a sua empresa para personalizar' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists checklist_templates_platform_guard on checklist_templates;
create trigger checklist_templates_platform_guard before insert or update or delete on checklist_templates
  for each row execute function checklist_platform_guard();
drop trigger if exists checklist_template_items_platform_guard on checklist_template_items;
create trigger checklist_template_items_platform_guard before insert or update or delete on checklist_template_items
  for each row execute function checklist_platform_guard();

-- A carga da biblioteca passa a marcar rafanutri.seed.
create or replace function seed_platform_checklist(p_code text, p_name text, p_description text, p_category text,
                                                   p_frequency text, p_items jsonb) returns void
language plpgsql as $$
declare tid uuid;
begin
  if exists (select 1 from checklist_templates where code = p_code and organization_id is null) then return; end if;
  perform set_config('rafanutri.seed', 'on', true);
  insert into checklist_templates (code, name, description, category, frequency_hint)
  values (p_code, p_name, p_description, p_category, p_frequency) returning id into tid;
  insert into checklist_template_items (template_id, position, section, prompt, kind, unit, min_value, max_value, critical, photo_on_fail)
  select tid, ord::integer, e ->> 's', e ->> 'p', coalesce(e ->> 'k', 'compliance'), e ->> 'u',
         (e ->> 'min')::numeric, (e ->> 'max')::numeric, coalesce((e ->> 'c')::boolean, false), coalesce((e ->> 'c')::boolean, false)
    from jsonb_array_elements(p_items) with ordinality as x(e, ord);
  perform set_config('rafanutri.seed', 'off', true);
end $$;

/** Copia um modelo (da biblioteca ou da própria empresa) para a empresa. Devolve o novo id. */
create or replace function checklist_template_copy(p_template uuid, p_org uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare t checklist_templates; nid uuid;
begin
  select * into t from checklist_templates where id = p_template;
  if t.id is null or (t.organization_id is not null and t.organization_id <> p_org) then
    raise exception 'Modelo indisponível' using errcode = 'P0001';
  end if;
  if not org_has_module(p_org, 'uan') then raise exception 'O módulo UAN não está habilitado' using errcode = 'P0001'; end if;
  insert into checklist_templates (organization_id, name, description, category, frequency_hint, source_template_id, user_created)
  values (p_org, left(t.name || case when t.organization_id is null then ' — personalizado' else ' (cópia)' end, 120), t.description, t.category, t.frequency_hint, t.id, p_user)
  returning id into nid;
  insert into checklist_template_items (template_id, position, section, prompt, help, kind, unit, min_value, max_value, critical, photo_on_fail)
  select nid, position, section, prompt, help, kind, unit, min_value, max_value, critical, photo_on_fail
    from checklist_template_items where template_id = t.id;
  return nid;
end $$;

-- Respostas: aceitar a referência ao item ficar nula quando o item é apagado do modelo.
create or replace function checklist_answers_guard() returns trigger language plpgsql as $$
declare st text;
begin
  -- Item apagado do modelo (FK on delete set null): só a referência muda, em qualquer situação.
  if tg_op = 'UPDATE' and old.item_id is not null and new.item_id is null
     and (to_jsonb(new) - 'item_id') = (to_jsonb(old) - 'item_id') then
    return new;
  end if;
  if tg_op = 'DELETE' then
    select status into st from checklist_runs where id = old.run_id;
    if st is null then return old; end if; -- execução sendo apagada (cascata)
    raise exception 'Respostas não são apagadas' using errcode = 'P0001';
  end if;
  select status into st from checklist_runs where id = new.run_id;
  if tg_op = 'INSERT' then
    if st is distinct from 'in_progress' then
      raise exception 'Checklist concluído ou cancelado não pode ser alterado' using errcode = 'P0001';
    end if;
    new.value := null; new.number_value := null; new.comment := null; new.photo := null;
    new.answered_by := null; new.answered_at := null;
    return new;
  end if;
  if st is distinct from 'in_progress' then
    raise exception 'Checklist concluído ou cancelado não pode ser alterado' using errcode = 'P0001';
  end if;
  if new.run_id <> old.run_id or new.position <> old.position or new.prompt <> old.prompt or new.kind <> old.kind
     or new.section is distinct from old.section or new.critical <> old.critical or new.photo_on_fail <> old.photo_on_fail
     or new.min_value is distinct from old.min_value or new.max_value is distinct from old.max_value
     or new.unit is distinct from old.unit or new.item_id is distinct from old.item_id then
    raise exception 'O item do checklist não muda' using errcode = 'P0001';
  end if;
  if new.kind = 'number' then
    new.value := case when new.value = 'na' then 'na' else checklist_number_value(new.number_value, new.min_value, new.max_value) end;
    if new.value = 'na' then new.number_value := null; end if;
  else
    new.number_value := null;
  end if;
  new.answered_at := now();
  return new;
end $$;

create table if not exists checklist_schedules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  unit_id           uuid not null references production_units (id) on delete cascade,
  template_id       uuid not null references checklist_templates (id) on delete cascade,
  weekdays          smallint[] not null check (weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(weekdays) between 1 and 7),
  at_time           time not null,
  tolerance_minutes integer not null default 60 check (tolerance_minutes between 15 and 720),
  active            boolean not null default true,
  created_by        uuid references directus_users (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists checklist_schedules_unit on checklist_schedules (unit_id, active);

create or replace function checklist_schedules_guard() returns trigger language plpgsql as $$
declare u production_units;
begin
  select * into u from production_units where id = new.unit_id;
  if u.id is null then raise exception 'Unidade indisponível' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.unit_id <> old.unit_id or new.template_id <> old.template_id) then
    raise exception 'A agenda não muda de unidade nem de modelo' using errcode = 'P0001';
  end if;
  new.organization_id := u.organization_id;
  if not exists (select 1 from checklist_templates t where t.id = new.template_id
                 and (t.organization_id is null or t.organization_id = u.organization_id)) then
    raise exception 'Modelo de checklist indisponível' using errcode = 'P0001';
  end if;
  select array_agg(distinct d order by d) into new.weekdays from unnest(new.weekdays) d;
  return new;
end $$;
drop trigger if exists checklist_schedules_guard on checklist_schedules;
create trigger checklist_schedules_guard before insert or update on checklist_schedules
  for each row execute function checklist_schedules_guard();

/**
 * Agenda do dia da unidade (fuso de São Paulo): cada checklist agendado para hoje com a situação.
 * done = execução concluída hoje; in_progress = iniciada hoje; overdue = passou do horário + tolerância;
 * pending = ainda no prazo.
 */
create or replace function checklist_day(p_unit uuid, p_at timestamptz default now())
returns table (schedule_id uuid, template_id uuid, template_name text, at_time time, tolerance_minutes integer, status text, run_id uuid)
language sql stable security definer set search_path = public as $$
  with local as (select (p_at at time zone 'America/Sao_Paulo') as ts)
  select s.id, s.template_id, t.name, s.at_time, s.tolerance_minutes,
         case when r.status = 'completed' then 'done'
              when r.status = 'in_progress' then 'in_progress'
              when (select ts::time from local) > s.at_time + make_interval(mins => s.tolerance_minutes) then 'overdue'
              else 'pending' end,
         r.id
    from checklist_schedules s
    join checklist_templates t on t.id = s.template_id
    left join lateral (
      select cr.id, cr.status from checklist_runs cr
       where cr.unit_id = s.unit_id and cr.template_id = s.template_id and cr.status <> 'cancelled'
         and (cr.started_at at time zone 'America/Sao_Paulo')::date = (select ts::date from local)
       order by (cr.status = 'completed') desc, cr.started_at desc limit 1
    ) r on true
   where s.unit_id = p_unit and s.active and t.active
     and extract(isodow from (select ts from local))::smallint = any (s.weekdays)
   order by s.at_time, t.name;
$$;

drop trigger if exists checklist_schedules_audit on checklist_schedules;
create trigger checklist_schedules_audit after insert or update or delete on checklist_schedules
  for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0038_checklist_editor') on conflict do nothing;

commit;
