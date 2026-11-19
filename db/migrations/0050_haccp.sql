-- U7 — APPCC: fluxograma, análise de perigos (RN-160) e PCC com limites e monitoramento (RN-161). Idempotente.
--
-- Decisões:
-- - Plano por unidade, opcionalmente a partir de uma ficha técnica (as etapas vêm dos passos da ficha).
--   Versões como na ficha: rascunho editável; aprovado (RT ou owner) é imutável; nova versão copia tudo.
-- - Perigo por etapa: biológico, químico, físico ou alergênico; severidade e probabilidade de 1 a 3
--   (risco = produto; significativo a partir de 4 — matriz a validar com a RT).
-- - Árvore decisória do Codex (4 perguntas) calculada no banco: `haccp_decision`. PCC numerado no plano.
-- - Monitoramento do PCC: o que, como, frequência, limite crítico (texto e faixa numérica), ação corretiva,
--   verificação e registro; pode apontar para um modelo de checklist ou um equipamento.

begin;

create table if not exists haccp_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  root_id         uuid,
  version         integer not null default 1 check (version >= 1),
  title           text not null check (char_length(btrim(title)) between 3 and 160),
  scope           text check (scope is null or char_length(scope) <= 2000),
  sheet_root_id   uuid references tech_sheets (id) on delete set null,
  status          text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by     uuid references directus_users (id) on delete set null,
  approved_at     timestamptz,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);
create index if not exists haccp_plans_unit on haccp_plans (unit_id, status);
create index if not exists haccp_plans_root on haccp_plans (root_id, version desc);
create unique index if not exists haccp_plans_one_draft on haccp_plans (root_id) where status = 'draft';

create table if not exists haccp_steps (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references haccp_plans (id) on delete cascade,
  position    integer not null check (position between 1 and 200),
  name        text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 1000),
  target_temp numeric(5, 1) check (target_temp is null or target_temp between -60 and 300),
  unique (plan_id, position) deferrable initially deferred
);

create table if not exists haccp_hazards (
  id                    uuid primary key default gen_random_uuid(),
  step_id               uuid not null references haccp_steps (id) on delete cascade,
  kind                  text not null check (kind in ('biological', 'chemical', 'physical', 'allergen')),
  description           text not null check (char_length(btrim(description)) between 3 and 500),
  cause                 text check (cause is null or char_length(cause) <= 500),
  severity              smallint not null check (severity between 1 and 3),
  probability           smallint not null check (probability between 1 and 3),
  risk                  smallint generated always as (severity * probability) stored,
  control_measure       text check (control_measure is null or char_length(control_measure) <= 1000),
  -- Árvore do Codex: Q1 há medida de controle? (Q1b: o controle aqui é necessário?) Q2 a etapa elimina ou
  -- reduz a nível aceitável? Q3 a contaminação pode passar do aceitável? Q4 uma etapa seguinte elimina?
  q1                    boolean,
  q1b                   boolean,
  q2                    boolean,
  q3                    boolean,
  q4                    boolean,
  decision              text check (decision in ('ccp', 'not_ccp', 'modify')),
  ccp_number            integer check (ccp_number is null or ccp_number between 1 and 99),
  critical_limit        text check (critical_limit is null or char_length(critical_limit) <= 300),
  limit_min             numeric(8, 2),
  limit_max             numeric(8, 2),
  limit_unit            text check (limit_unit is null or char_length(limit_unit) <= 20),
  monitoring_what       text check (monitoring_what is null or char_length(monitoring_what) <= 300),
  monitoring_how        text check (monitoring_how is null or char_length(monitoring_how) <= 500),
  monitoring_frequency  text check (monitoring_frequency is null or char_length(monitoring_frequency) <= 120),
  monitoring_kind       text check (monitoring_kind is null or monitoring_kind in ('temperature', 'checklist', 'visual', 'other')),
  checklist_template_id uuid references checklist_templates (id) on delete set null,
  equipment_id          uuid references equipment (id) on delete set null,
  corrective_action     text check (corrective_action is null or char_length(corrective_action) <= 1000),
  verification          text check (verification is null or char_length(verification) <= 500),
  records               text check (records is null or char_length(records) <= 300),
  check (limit_min is null or limit_max is null or limit_min <= limit_max)
);
create index if not exists haccp_hazards_step on haccp_hazards (step_id);

/** Árvore decisória do Codex: 'ccp', 'not_ccp', 'modify' (falta controle necessário) ou null (incompleta). */
create or replace function haccp_decision(q1 boolean, q1b boolean, q2 boolean, q3 boolean, q4 boolean) returns text
language sql immutable as $$
  select case
    when q1 is null then null
    when not q1 then case when q1b is null then null when q1b then 'modify' else 'not_ccp' end
    when q2 is null then null
    when q2 then 'ccp'
    when q3 is null then null
    when not q3 then 'not_ccp'
    when q4 is null then null
    when q4 then 'not_ccp'
    else 'ccp'
  end;
$$;

-- Plano: módulo; organização da unidade; root; aprovado imutável (só arquiva); aprovar pela função.
create or replace function haccp_plans_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    if not org_has_module(new.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    if new.sheet_root_id is not null and not exists (select 1 from tech_sheets where id = new.sheet_root_id and organization_id = new.organization_id) then
      raise exception 'Ficha técnica de outra empresa' using errcode = 'P0001';
    end if;
    new.root_id := coalesce(new.root_id, new.id);
    if current_setting('rafanutri.haccp_version', true) is distinct from 'on' then new.version := 1; new.root_id := new.id; end if;
    new.status := 'draft'; new.approved_by := null; new.approved_at := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and exists (select 1 from production_units where id = old.unit_id) then
      raise exception 'Plano aprovado não se apaga; arquive' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if new.unit_id <> old.unit_id or new.organization_id <> old.organization_id or new.root_id <> old.root_id or new.version <> old.version then
    raise exception 'O plano não muda de unidade nem de versão' using errcode = 'P0001';
  end if;
  if old.status = 'archived' then
    if (to_jsonb(new) - 'approved_by' - 'created_by' - 'sheet_root_id') = (to_jsonb(old) - 'approved_by' - 'created_by' - 'sheet_root_id') then return new; end if;
    raise exception 'Plano arquivado não se altera' using errcode = 'P0001';
  end if;
  if old.status = 'approved' then
    if new.status = 'archived' and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then return new; end if;
    if (to_jsonb(new) - 'approved_by' - 'created_by' - 'sheet_root_id') = (to_jsonb(old) - 'approved_by' - 'created_by' - 'sheet_root_id') then return new; end if;
    raise exception 'Plano aprovado não se altera; crie uma nova versão' using errcode = 'P0001';
  end if;
  if new.status = 'approved' and current_setting('rafanutri.haccp_approve', true) is distinct from 'on' then
    raise exception 'Use a aprovação do plano' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists haccp_plans_guard on haccp_plans;
create trigger haccp_plans_guard before insert or update or delete on haccp_plans for each row execute function haccp_plans_guard();

-- Etapas e perigos: só no rascunho (ou em cascata).
create or replace function haccp_parts_guard() returns trigger language plpgsql as $$
declare plan uuid; st text;
begin
  if tg_table_name = 'haccp_steps' then
    plan := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;
    if tg_op = 'UPDATE' and new.plan_id <> old.plan_id then raise exception 'A etapa não muda de plano' using errcode = 'P0001'; end if;
  else
    plan := (select plan_id from haccp_steps where id = case when tg_op = 'DELETE' then old.step_id else new.step_id end);
    if tg_op = 'UPDATE' and new.step_id <> old.step_id then raise exception 'O perigo não muda de etapa' using errcode = 'P0001'; end if;
  end if;
  select status into st from haccp_plans where id = plan;
  if st is null then return case when tg_op = 'DELETE' then old else new end; end if; -- cascata
  if st <> 'draft' and current_setting('rafanutri.haccp_version', true) is distinct from 'on' then
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'checklist_template_id' - 'equipment_id') = (to_jsonb(old) - 'checklist_template_id' - 'equipment_id') then return new; end if;
    raise exception 'Plano aprovado não se altera; crie uma nova versão' using errcode = 'P0001';
  end if;
  if tg_table_name = 'haccp_hazards' and tg_op <> 'DELETE' then
    new.decision := haccp_decision(new.q1, new.q1b, new.q2, new.q3, new.q4);
    if new.decision is distinct from 'ccp' then new.ccp_number := null; end if;
    if new.checklist_template_id is not null and not exists (
      select 1 from checklist_templates t join haccp_plans p on p.id = plan
       where t.id = new.checklist_template_id and (t.organization_id is null or t.organization_id = p.organization_id)) then
      raise exception 'Modelo de checklist de outra empresa' using errcode = 'P0001';
    end if;
    if new.equipment_id is not null and not exists (
      select 1 from equipment e join haccp_plans p on p.id = plan where e.id = new.equipment_id and e.unit_id = p.unit_id) then
      raise exception 'Equipamento de outra unidade' using errcode = 'P0001';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists haccp_steps_guard on haccp_steps;
create trigger haccp_steps_guard before insert or update or delete on haccp_steps for each row execute function haccp_parts_guard();
drop trigger if exists haccp_hazards_guard on haccp_hazards;
create trigger haccp_hazards_guard before insert or update or delete on haccp_hazards for each row execute function haccp_parts_guard();

/** Etapas do rascunho a partir dos passos da versão vigente da ficha (substitui as etapas existentes). */
create or replace function haccp_steps_from_sheet(p_plan uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare p haccp_plans; sheet uuid; n integer;
begin
  select * into p from haccp_plans where id = p_plan for update;
  if p.id is null or p.status <> 'draft' then raise exception 'Só rascunho recebe etapas' using errcode = 'P0001'; end if;
  if p.sheet_root_id is null then raise exception 'O plano não tem ficha técnica' using errcode = 'P0001'; end if;
  select id into sheet from tech_sheets where root_id = p.sheet_root_id and status <> 'archived' order by (status = 'approved') desc, version desc limit 1;
  if sheet is null then raise exception 'Ficha técnica sem versão em uso' using errcode = 'P0001'; end if;
  delete from haccp_steps where plan_id = p.id;
  insert into haccp_steps (plan_id, position, name, description, target_temp)
  select p.id, s.position, left(s.text, 160), case when char_length(s.text) > 160 then s.text end, s.target_temp
    from tech_sheet_steps s where s.sheet_id = sheet order by s.position;
  get diagnostics n = row_count;
  return n;
end $$;

/** Aprova o rascunho: RT da unidade ou owner; todo perigo significativo precisa da árvore respondida e,
    se for PCC, de limite crítico, monitoramento e ação corretiva. PCCs numerados pela ordem das etapas. */
create or replace function haccp_plan_approve(p_plan uuid, p_user uuid) returns haccp_plans
language plpgsql security definer set search_path = public as $$
declare p haccp_plans; missing integer;
begin
  select * into p from haccp_plans where id = p_plan for update;
  if p.id is null or p.status <> 'draft' then raise exception 'Só rascunho pode ser aprovado' using errcode = 'P0001'; end if;
  if not exists (select 1 from organization_members where organization_id = p.organization_id and user_id = p_user and role = 'owner')
     and not exists (select 1 from unit_members where unit_id = p.unit_id and user_id = p_user and role = 'technical_lead') then
    raise exception 'Só o RT da unidade ou o responsável pela empresa aprovam o APPCC' using errcode = 'P0001';
  end if;
  if not exists (select 1 from haccp_steps where plan_id = p.id) then
    raise exception 'O plano não tem etapas' using errcode = 'P0001';
  end if;
  select count(*) into missing from haccp_hazards h join haccp_steps s on s.id = h.step_id
   where s.plan_id = p.id and h.risk >= 4 and h.decision is null;
  if missing > 0 then raise exception 'Responda a árvore decisória de % perigo(s) significativo(s)', missing using errcode = 'P0001'; end if;
  select count(*) into missing from haccp_hazards h join haccp_steps s on s.id = h.step_id
   where s.plan_id = p.id and h.decision = 'ccp'
     and (coalesce(btrim(h.critical_limit), '') = '' or coalesce(btrim(h.monitoring_what), '') = '' or coalesce(btrim(h.corrective_action), '') = '');
  if missing > 0 then raise exception '% PCC sem limite crítico, monitoramento ou ação corretiva', missing using errcode = 'P0001'; end if;
  update haccp_hazards h set ccp_number = n.k
    from (select h2.id, row_number() over (order by s.position, h2.kind, h2.id) as k
            from haccp_hazards h2 join haccp_steps s on s.id = h2.step_id where s.plan_id = p.id and h2.decision = 'ccp') n
   where h.id = n.id;
  perform set_config('rafanutri.haccp_approve', 'on', true);
  update haccp_plans set status = 'approved', approved_by = p_user, approved_at = now() where id = p.id returning * into p;
  perform set_config('rafanutri.haccp_approve', 'off', true);
  -- a versão anterior aprovada sai de uso
  update haccp_plans set status = 'archived' where root_id = p.root_id and id <> p.id and status = 'approved';
  return p;
end $$;

/** Nova versão (rascunho) copiando etapas e perigos da versão informada. */
create or replace function haccp_plan_new_version(p_plan uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare p haccp_plans; nid uuid := gen_random_uuid(); s record; sid uuid;
begin
  select * into p from haccp_plans where id = p_plan;
  if p.id is null or p.status = 'draft' then raise exception 'Copie a partir de uma versão aprovada' using errcode = 'P0001'; end if;
  if exists (select 1 from haccp_plans where root_id = p.root_id and status = 'draft') then
    raise exception 'Já existe um rascunho deste plano' using errcode = 'P0001';
  end if;
  perform set_config('rafanutri.haccp_version', 'on', true);
  insert into haccp_plans (id, unit_id, root_id, version, title, scope, sheet_root_id, created_by)
  values (nid, p.unit_id, p.root_id, (select max(version) + 1 from haccp_plans where root_id = p.root_id), p.title, p.scope, p.sheet_root_id, p_user);
  for s in select * from haccp_steps where plan_id = p.id order by position loop
    insert into haccp_steps (plan_id, position, name, description, target_temp) values (nid, s.position, s.name, s.description, s.target_temp) returning id into sid;
    insert into haccp_hazards (step_id, kind, description, cause, severity, probability, control_measure, q1, q1b, q2, q3, q4,
                               critical_limit, limit_min, limit_max, limit_unit, monitoring_what, monitoring_how, monitoring_frequency,
                               monitoring_kind, checklist_template_id, equipment_id, corrective_action, verification, records)
    select sid, kind, description, cause, severity, probability, control_measure, q1, q1b, q2, q3, q4,
           critical_limit, limit_min, limit_max, limit_unit, monitoring_what, monitoring_how, monitoring_frequency,
           monitoring_kind, checklist_template_id, equipment_id, corrective_action, verification, records
      from haccp_hazards where step_id = s.id;
  end loop;
  perform set_config('rafanutri.haccp_version', 'off', true);
  return nid;
end $$;

do $$
begin
  drop trigger if exists haccp_plans_audit on haccp_plans;
  create trigger haccp_plans_audit after insert or update or delete on haccp_plans for each row execute function audit_trigger();
end $$;

insert into schema_migrations (version) values ('0050_haccp') on conflict do nothing;

commit;
