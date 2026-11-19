-- U6b — Integridade dos registros de qualidade (RN-167). Idempotente.
--
-- Decisões:
-- - Checklist concluído guarda `content_hash` = SHA-256 de um texto canônico da execução e das respostas
--   (datas em epoch, para não depender do fuso da sessão; sem ids de usuário, que viram null quando a conta
--   é apagada). Calculado na conclusão; os já concluídos recebem o hash na migração.
-- - `uan_integrity_check(unidade, de, até)` recalcula os hashes de checklists e versões de documento do
--   período e aponta divergências (o dossiê usa).
-- - Registros de qualidade não se apagam: só somem em cascata com a unidade ou a empresa.
-- - Auditoria (RN-009) nas tabelas da UAN que ainda não tinham.

begin;

alter table checklist_runs add column if not exists content_hash text;

/** Texto canônico de uma execução (dados da linha `r` + respostas gravadas). */
create or replace function checklist_run_canonical(r checklist_runs) returns text
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'unit_id', r.unit_id, 'template_name', r.template_name, 'status', r.status,
    'started_at', extract(epoch from r.started_at)::numeric(16, 3), 'completed_at', extract(epoch from r.completed_at)::numeric(16, 3),
    'score', r.score, 'conform', r.conform_count, 'non_conform', r.non_conform_count, 'na', r.na_count,
    'geo', jsonb_build_array(r.geo_lat, r.geo_lng, r.geo_accuracy_m, r.geo_distance_m), 'signature', r.signature,
    'answers', coalesce((
      select jsonb_agg(jsonb_build_array(a.position, a.section, a.prompt, a.kind, a.unit, a.min_value, a.max_value, a.critical,
                                         a.value, a.number_value, a.comment, a.photo, extract(epoch from a.answered_at)::numeric(16, 3))
                       order by a.position)
        from checklist_answers a where a.run_id = r.id), '[]'::jsonb)
  )::text;
$$;

create or replace function checklist_run_digest(r checklist_runs) returns text
language sql stable security definer set search_path = public as $$
  select encode(sha256(convert_to(checklist_run_canonical(r), 'UTF8')), 'hex');
$$;

-- Guarda da execução: a de 0035 + hash só pela conclusão (ou pelo preenchimento desta migração) e
-- FK em "set null" (conta ou arquivo apagado) liberada em execução fechada.
create or replace function checklist_runs_guard() returns trigger language plpgsql as $$
declare u production_units;
begin
  if tg_op = 'INSERT' then
    select * into u from production_units where id = new.unit_id;
    if u.id is null or not u.active then
      raise exception 'Só unidades ativas fazem checklists' using errcode = 'P0001';
    end if;
    if not org_has_module(u.organization_id, 'uan') then
      raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
    end if;
    new.organization_id := u.organization_id;
    if new.template_id is not null and not exists (
      select 1 from checklist_templates t where t.id = new.template_id and t.active
        and (t.organization_id is null or t.organization_id = u.organization_id)
    ) then
      raise exception 'Modelo de checklist indisponível' using errcode = 'P0001';
    end if;
    new.status := 'in_progress';
    new.started_at := now();
    new.completed_at := null; new.completed_by := null; new.score := null;
    new.conform_count := null; new.non_conform_count := null; new.na_count := null;
    new.content_hash := null;
    new.geo_distance_m := case when new.geo_lat is not null and u.geo_lat is not null
                               then geo_distance_m(new.geo_lat, new.geo_lng, u.geo_lat, u.geo_lng) end;
    return new;
  end if;
  if old.status <> 'in_progress' then
    -- só pela ação de FK (gatilho dentro de gatilho), nunca por um UPDATE direto
    if pg_trigger_depth() > 1
       and (to_jsonb(new) - 'completed_by' - 'started_by' - 'template_id' - 'signature' - 'signed_by')
       = (to_jsonb(old) - 'completed_by' - 'started_by' - 'template_id' - 'signature' - 'signed_by')
       and (new.completed_by is null or new.completed_by = old.completed_by)
       and (new.started_by is null or new.started_by = old.started_by)
       and (new.template_id is null or new.template_id = old.template_id)
       and (new.signature is null or new.signature = old.signature)
       and (new.signed_by is null or new.signed_by = old.signed_by) then
      return new; -- FK set null (conta, modelo ou arquivo apagado)
    end if;
    if old.content_hash is null and current_setting('rafanutri.integrity_backfill', true) = 'on'
       and (to_jsonb(new) - 'content_hash') = (to_jsonb(old) - 'content_hash') then
      return new;
    end if;
    raise exception 'Checklist concluído ou cancelado não pode ser alterado' using errcode = 'P0001';
  end if;
  if new.organization_id <> old.organization_id or new.unit_id <> old.unit_id or new.client_id <> old.client_id
     or new.template_name <> old.template_name or new.started_at <> old.started_at
     or new.started_by is distinct from old.started_by
     or new.geo_lat is distinct from old.geo_lat or new.geo_lng is distinct from old.geo_lng
     or new.geo_distance_m is distinct from old.geo_distance_m then
    raise exception 'Dados de início do checklist não mudam' using errcode = 'P0001';
  end if;
  if new.status = 'completed' and current_setting('rafanutri.checklist_complete', true) is distinct from 'on' then
    raise exception 'Use checklist_complete para concluir' using errcode = 'P0001';
  end if;
  if current_setting('rafanutri.checklist_complete', true) is distinct from 'on' then
    new.content_hash := null;
  end if;
  return new;
end $$;

-- Respostas: a de 0041 + FK set null de conta e foto liberado (antes, apagar a conta de quem respondeu um
-- checklist concluído falhava).
create or replace function checklist_answers_guard() returns trigger language plpgsql as $$
declare st text;
begin
  -- Item apagado do modelo (FK on delete set null): só a referência muda, em qualquer situação.
  if tg_op = 'UPDATE' and old.item_id is not null and new.item_id is null
     and (to_jsonb(new) - 'item_id') = (to_jsonb(old) - 'item_id') then
    return new;
  end if;
  -- Conta ou arquivo apagado (FK set null), só pela ação de FK: em qualquer situação.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
     and (to_jsonb(new) - 'answered_by' - 'photo') = (to_jsonb(old) - 'answered_by' - 'photo')
     and (new.answered_by is null or new.answered_by = old.answered_by) and (new.photo is null or new.photo = old.photo) then
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
  -- Horário da resposta: o do aparelho (modo offline) se for das últimas 72 h; senão, o do servidor.
  if new.answered_at is distinct from old.answered_at and new.answered_at is not null
     and new.answered_at between now() - interval '72 hours' and now() + interval '5 minutes' then
    new.answered_at := least(new.answered_at, now());
  else
    new.answered_at := now();
  end if;
  return new;
end $$;

/** Conclusão (a de 0035) gravando também o hash de integridade. */
create or replace function checklist_complete(p_run uuid, p_user uuid) returns checklist_runs
language plpgsql security definer set search_path = public as $$
declare r checklist_runs; missing integer; c integer; nc integer; na integer;
begin
  select * into r from checklist_runs where id = p_run for update;
  if r.id is null then raise exception 'Checklist não encontrado' using errcode = 'P0001'; end if;
  if r.status <> 'in_progress' then raise exception 'Checklist já concluído ou cancelado' using errcode = 'P0001'; end if;
  select count(*) into missing from checklist_answers where run_id = p_run and value is null;
  if missing > 0 then
    raise exception 'Faltam % item(ns) sem resposta', missing using errcode = 'P0001';
  end if;
  if exists (select 1 from checklist_answers where run_id = p_run and value = 'non_conform' and (critical or photo_on_fail)
             and (photo is null or comment is null or btrim(comment) = '')) then
    raise exception 'Item crítico não conforme precisa de foto e comentário' using errcode = 'P0001';
  end if;
  select count(*) filter (where value = 'conform'), count(*) filter (where value = 'non_conform'), count(*) filter (where value = 'na')
    into c, nc, na from checklist_answers where run_id = p_run;
  r.status := 'completed'; r.completed_at := now(); r.completed_by := p_user;
  r.conform_count := c; r.non_conform_count := nc; r.na_count := na;
  r.score := case when c + nc > 0 then round(100.0 * c / (c + nc), 2) end;
  perform set_config('rafanutri.checklist_complete', 'on', true);
  update checklist_runs set status = r.status, completed_at = r.completed_at, completed_by = r.completed_by,
         conform_count = c, non_conform_count = nc, na_count = na, score = r.score,
         content_hash = checklist_run_digest(r)
   where id = p_run returning * into r;
  perform set_config('rafanutri.checklist_complete', 'off', true);
  insert into non_conformities (organization_id, unit_id, source, run_id, answer_position, title, description, severity, due_at, photo, opened_by)
  select r.organization_id, r.unit_id, 'checklist', r.id, a.position, left(a.prompt, 500),
         left(concat_ws(E'\n', a.comment, case when a.kind = 'number' then 'Valor: ' || a.number_value || coalesce(' ' || a.unit, '') end,
                        'Checklist: ' || r.template_name), 2000),
         'critical', nc_due('critical'), a.photo, p_user
    from checklist_answers a where a.run_id = r.id and a.value = 'non_conform' and a.critical;
  return r;
end $$;

-- Hash dos checklists já concluídos.
do $$
begin
  perform set_config('rafanutri.integrity_backfill', 'on', true);
  update checklist_runs r set content_hash = checklist_run_digest(r) where r.status = 'completed' and r.content_hash is null;
  perform set_config('rafanutri.integrity_backfill', 'off', true);
end $$;

/** Recalcula os hashes do período (checklists concluídos e versões aprovadas de documentos) e compara. */
create or replace function uan_integrity_check(p_unit uuid, p_from date, p_to date)
returns table (kind text, record_id uuid, label text, recorded_at timestamptz, stored_hash text, computed_hash text, ok boolean)
language sql stable security definer set search_path = public as $$
  select 'checklist', r.id, r.template_name, r.completed_at, r.content_hash, checklist_run_digest(r),
         r.content_hash is not null and r.content_hash = checklist_run_digest(r)
    from checklist_runs r
   where r.unit_id = p_unit and r.status = 'completed'
     and r.completed_at >= p_from::timestamp at time zone 'America/Sao_Paulo'
     and r.completed_at < (p_to + 1)::timestamp at time zone 'America/Sao_Paulo'
  union all
  select 'document', v.id, d.title || ' v' || v.version, v.approved_at, v.content_hash,
         encode(sha256(convert_to(v.body_md, 'UTF8')), 'hex'),
         v.content_hash = encode(sha256(convert_to(v.body_md, 'UTF8')), 'hex')
    from quality_document_versions v join quality_documents d on d.id = v.document_id
   where d.unit_id = p_unit and v.status = 'approved'
   order by 4;
$$;

-- Registros de qualidade: sem delete físico (só em cascata com a unidade ou a empresa).
create or replace function uan_no_delete() returns trigger language plpgsql as $$
declare j jsonb := to_jsonb(old); unit uuid; org uuid;
begin
  org := nullif(j ->> 'organization_id', '')::uuid;
  unit := nullif(j ->> 'unit_id', '')::uuid;
  if org is not null and not exists (select 1 from organizations where id = org) then return old; end if;
  if unit is not null and not exists (select 1 from production_units where id = unit) then return old; end if;
  if j ? 'run_id' and not exists (select 1 from checklist_runs where id = (j ->> 'run_id')::uuid) then return old; end if;
  if j ? 'training_id' and not exists (select 1 from trainings where id = (j ->> 'training_id')::uuid) then return old; end if;
  if j ? 'version_id' and not exists (select 1 from quality_document_versions where id = (j ->> 'version_id')::uuid) then return old; end if;
  raise exception 'Registro de qualidade não se apaga' using errcode = 'P0001';
end $$;

do $$
declare t text;
begin
  foreach t in array array['checklist_runs', 'checklist_answers', 'temperature_readings', 'non_conformities', 'trainings',
                           'training_attendees', 'document_acknowledgements', 'goods_receipts', 'stock_movements',
                           'waste_records', 'diner_counts'] loop
    execute format('drop trigger if exists %I on %I', t || '_no_delete', t);
    execute format('create trigger %I before delete on %I for each row execute function uan_no_delete()', t || '_no_delete', t);
  end loop;
  foreach t in array array['organization_contracts', 'stock_lots', 'stock_movements'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

insert into schema_migrations (version) values ('0049_integrity') on conflict do nothing;

commit;
