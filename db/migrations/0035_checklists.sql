-- U1a — Checklists de Boas Práticas (RN-146, base do RN-147/148) e não conformidades (base do RN-153).
-- Idempotente.
--
-- Decisões:
-- - Modelos da plataforma (organization_id nulo, com `code`) são só leitura; os da organização virão com o editor.
-- - Ao iniciar uma execução, os itens do modelo são copiados para checklist_answers (texto, tipo, limites,
--   crítico). Mudar o modelo depois não altera checklists já feitos.
-- - Checklist concluído ou cancelado é imutável: o banco recusa mudar respostas e a própria execução.
-- - Concluir (checklist_complete) exige todas as respostas; item crítico "não conforme" exige comentário
--   e foto; calcula a pontuação (conformes ÷ aplicáveis) e abre uma não conformidade por item crítico.
-- - Tabelas sem permissão no Directus: tudo passa pelos endpoints /rafanutri/uan/*.

begin;

create table if not exists checklist_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  code            text check (code is null or code ~ '^[a-z0-9-]{2,60}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  description     text check (description is null or char_length(description) <= 500),
  category        text not null default 'other'
                    check (category in ('bpf_audit', 'opening', 'hygiene', 'receiving', 'cleaning', 'temperature', 'pests', 'water', 'other')),
  frequency_hint  text not null default 'on_demand' check (frequency_hint in ('daily', 'weekly', 'monthly', 'on_demand')),
  active          boolean not null default true,
  user_created    uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  check ((organization_id is null) = (code is not null))
);
create unique index if not exists checklist_templates_platform_code on checklist_templates (code) where organization_id is null;
create index if not exists checklist_templates_org on checklist_templates (organization_id, active);

create table if not exists checklist_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references checklist_templates (id) on delete cascade,
  position      integer not null check (position between 1 and 500),
  section       text check (section is null or char_length(section) <= 120),
  prompt        text not null check (char_length(btrim(prompt)) between 3 and 500),
  help          text check (help is null or char_length(help) <= 500),
  kind          text not null default 'compliance' check (kind in ('compliance', 'number')),
  unit          text check (unit is null or char_length(unit) <= 10),
  min_value     numeric(8, 2),
  max_value     numeric(8, 2),
  critical      boolean not null default false,
  photo_on_fail boolean not null default false,
  unique (template_id, position),
  check (kind = 'number' or (min_value is null and max_value is null)),
  check (kind = 'compliance' or min_value is not null or max_value is not null),
  check (min_value is null or max_value is null or min_value <= max_value)
);

create table if not exists checklist_runs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations (id) on delete cascade,
  unit_id           uuid not null references production_units (id) on delete cascade,
  template_id       uuid references checklist_templates (id) on delete set null,
  template_name     text not null,
  client_id         uuid not null unique,
  status            text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  started_by        uuid references directus_users (id) on delete set null,
  started_at        timestamptz not null default now(),
  completed_by      uuid references directus_users (id) on delete set null,
  completed_at      timestamptz,
  score             numeric(5, 2) check (score is null or score between 0 and 100),
  conform_count     integer,
  non_conform_count integer,
  na_count          integer,
  geo_lat           numeric(9, 6) check (geo_lat is null or geo_lat between -90 and 90),
  geo_lng           numeric(9, 6) check (geo_lng is null or geo_lng between -180 and 180),
  geo_accuracy_m    integer check (geo_accuracy_m is null or geo_accuracy_m between 0 and 100000),
  geo_distance_m    integer,
  check ((geo_lat is null) = (geo_lng is null))
);
create index if not exists checklist_runs_unit on checklist_runs (unit_id, started_at desc);

create table if not exists checklist_answers (
  run_id        uuid not null references checklist_runs (id) on delete cascade,
  position      integer not null,
  item_id       uuid references checklist_template_items (id) on delete set null,
  section       text,
  prompt        text not null,
  help          text,
  kind          text not null check (kind in ('compliance', 'number')),
  unit          text,
  min_value     numeric(8, 2),
  max_value     numeric(8, 2),
  critical      boolean not null default false,
  photo_on_fail boolean not null default false,
  value         text check (value is null or value in ('conform', 'non_conform', 'na')),
  number_value  numeric(8, 2),
  comment       text check (comment is null or char_length(comment) <= 1000),
  photo         uuid references directus_files (id) on delete set null,
  answered_by   uuid references directus_users (id) on delete set null,
  answered_at   timestamptz,
  primary key (run_id, position)
);

create table if not exists non_conformities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  source          text not null check (source in ('checklist', 'temperature', 'receiving', 'manual')),
  run_id          uuid references checklist_runs (id) on delete set null,
  answer_position integer,
  title           text not null check (char_length(btrim(title)) between 3 and 500),
  description     text check (description is null or char_length(description) <= 2000),
  severity        text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status          text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  due_at          timestamptz not null,
  photo           uuid references directus_files (id) on delete set null,
  opened_by       uuid references directus_users (id) on delete set null,
  opened_at       timestamptz not null default now(),
  closed_by       uuid references directus_users (id) on delete set null,
  closed_at       timestamptz
);
create index if not exists non_conformities_unit on non_conformities (unit_id, status, due_at);

/** Prazo padrão por severidade: crítica 24 h, alta 72 h, média 7 dias, baixa 15 dias. */
create or replace function nc_due(p_severity text, p_from timestamptz default now()) returns timestamptz
language sql immutable as $$
  select p_from + case p_severity when 'critical' then interval '24 hours' when 'high' then interval '72 hours'
                                  when 'medium' then interval '7 days' else interval '15 days' end;
$$;

/** Distância em metros entre dois pontos (haversine). */
create or replace function geo_distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns integer
language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
    cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2))))::integer;
$$;

/** Valor de um item numérico: dentro dos limites = conforme. */
create or replace function checklist_number_value(p_value numeric, p_min numeric, p_max numeric) returns text
language sql immutable as $$
  select case when p_value is null then null
              when (p_min is not null and p_value < p_min) or (p_max is not null and p_value > p_max) then 'non_conform'
              else 'conform' end;
$$;

-- Execução: organização vem da unidade; modelo da plataforma ou da mesma organização; imutável depois de fechada.
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
    new.geo_distance_m := case when new.geo_lat is not null and u.geo_lat is not null
                               then geo_distance_m(new.geo_lat, new.geo_lng, u.geo_lat, u.geo_lng) end;
    return new;
  end if;
  if old.status <> 'in_progress' then
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
  return new;
end $$;
drop trigger if exists checklist_runs_guard on checklist_runs;
create trigger checklist_runs_guard before insert or update on checklist_runs
  for each row execute function checklist_runs_guard();

-- Respostas: só com a execução aberta; o texto copiado do modelo não muda; número vira conforme/não conforme.
create or replace function checklist_answers_guard() returns trigger language plpgsql as $$
declare st text;
begin
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
drop trigger if exists checklist_answers_guard on checklist_answers;
create trigger checklist_answers_guard before insert or update or delete on checklist_answers
  for each row execute function checklist_answers_guard();

/** Inicia: cria a execução (idempotente por client_id) e copia os itens do modelo. Devolve o id. */
create or replace function checklist_start(p_unit uuid, p_template uuid, p_user uuid, p_client uuid,
                                           p_lat numeric default null, p_lng numeric default null, p_acc integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r checklist_runs; t checklist_templates;
begin
  select * into r from checklist_runs where client_id = p_client;
  if r.id is not null then
    if r.unit_id <> p_unit or r.template_id is distinct from p_template then
      raise exception 'Identificador de checklist já usado' using errcode = 'P0001';
    end if;
    return r.id;
  end if;
  select * into t from checklist_templates where id = p_template;
  if t.id is null then raise exception 'Modelo de checklist indisponível' using errcode = 'P0001'; end if;
  if not exists (select 1 from checklist_template_items where template_id = t.id) then
    raise exception 'Modelo sem itens' using errcode = 'P0001';
  end if;
  insert into checklist_runs (organization_id, unit_id, template_id, template_name, client_id, started_by, geo_lat, geo_lng, geo_accuracy_m)
  values ((select organization_id from production_units where id = p_unit), p_unit, t.id, t.name, p_client, p_user, p_lat, p_lng, p_acc)
  returning * into r;
  insert into checklist_answers (run_id, position, item_id, section, prompt, help, kind, unit, min_value, max_value, critical, photo_on_fail)
  select r.id, i.position, i.id, i.section, i.prompt, i.help, i.kind, i.unit, i.min_value, i.max_value, i.critical, i.photo_on_fail
    from checklist_template_items i where i.template_id = t.id;
  return r.id;
end $$;

/**
 * Conclui: exige todas as respostas; item crítico (ou com foto obrigatória) não conforme exige comentário
 * e foto. Calcula a pontuação e abre uma não conformidade por item crítico não conforme.
 */
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
  perform set_config('rafanutri.checklist_complete', 'on', true);
  update checklist_runs set status = 'completed', completed_at = now(), completed_by = p_user,
         conform_count = c, non_conform_count = nc, na_count = na,
         score = case when c + nc > 0 then round(100.0 * c / (c + nc), 2) end
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

-- Não conformidade: organização vem da unidade; prazo padrão pela severidade.
create or replace function non_conformities_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := (select organization_id from production_units where id = new.unit_id);
    new.opened_at := now();
    new.due_at := coalesce(new.due_at, nc_due(new.severity));
    return new;
  end if;
  if new.organization_id <> old.organization_id or new.unit_id <> old.unit_id or new.source <> old.source
     or new.run_id is distinct from old.run_id or new.opened_at <> old.opened_at then
    raise exception 'Origem da não conformidade não muda' using errcode = 'P0001';
  end if;
  if new.status = 'closed' and old.status <> 'closed' then new.closed_at := now(); end if;
  return new;
end $$;
drop trigger if exists non_conformities_guard on non_conformities;
create trigger non_conformities_guard before insert or update on non_conformities
  for each row execute function non_conformities_guard();

do $$
declare t text;
begin
  foreach t in array array['checklist_runs', 'non_conformities', 'checklist_templates'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on %I for each row execute function audit_trigger()', t || '_audit', t);
  end loop;
end $$;

-- ── Biblioteca da plataforma (modelos iniciais; a RT revisa antes do piloto) ─────────────────────
create or replace function seed_platform_checklist(p_code text, p_name text, p_description text, p_category text,
                                                   p_frequency text, p_items jsonb) returns void
language plpgsql as $$
declare tid uuid;
begin
  if exists (select 1 from checklist_templates where code = p_code and organization_id is null) then return; end if;
  insert into checklist_templates (code, name, description, category, frequency_hint)
  values (p_code, p_name, p_description, p_category, p_frequency) returning id into tid;
  insert into checklist_template_items (template_id, position, section, prompt, kind, unit, min_value, max_value, critical, photo_on_fail)
  select tid, ord::integer, e ->> 's', e ->> 'p', coalesce(e ->> 'k', 'compliance'), e ->> 'u',
         (e ->> 'min')::numeric, (e ->> 'max')::numeric, coalesce((e ->> 'c')::boolean, false), coalesce((e ->> 'c')::boolean, false)
    from jsonb_array_elements(p_items) with ordinality as x(e, ord);
end $$;

select seed_platform_checklist('rdc-216', 'RDC 216/2004 — Boas Práticas',
  'Checklist oficial de Boas Práticas para serviços de alimentação (RDC 216/2004). Itens críticos marcados para revisão da RT.',
  'bpf_audit', 'monthly', $j$[
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As instalações são isentas de focos de insalubridade e riscos à saúde?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"O acesso é direto e independente, não comum a outros usos?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As áreas de recebimento são separadas das áreas de produção?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"O piso é liso, impermeável e em bom estado?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As paredes são lisas, impermeáveis e em bom estado?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"Os tetos são lisos, impermeáveis e sem mofo?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As portas possuem fechamento automático e barreiras contra pragas?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As janelas possuem telas milimétricas removíveis?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"A iluminação é adequada e uniforme?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As luminárias estão protegidas contra estilhaçamento?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"A ventilação evita calor excessivo e contaminação cruzada?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"As instalações sanitárias são separadas da área de manipulação?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"Existem lavatórios com água corrente e sabonete antisséptico?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"Equipamentos e móveis são adequados e higienizáveis?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"Utensílios são de material adequado e em bom estado?"},
  {"s":"1. Edificação, instalações, equipamentos, móveis e utensílios","p":"Existe área específica para higienização de utensílios?"},
  {"s":"2. Abastecimento de água","p":"A água utilizada no preparo dos alimentos e na higienização é potável e em quantidade suficiente?","c":true},
  {"s":"2. Abastecimento de água","p":"Se a água não vem da rede pública, há sistema de tratamento próprio e a potabilidade é comprovada por laudos de análise?"},
  {"s":"2. Abastecimento de água","p":"Os reservatórios de água são limpos e desinfetados periodicamente, com registros que comprovem essas ações?"},
  {"s":"3. Esgotamento sanitário e resíduos sólidos","p":"O sistema de esgoto está ligado à rede pública ou possui sistema individual devidamente licenciado?"},
  {"s":"3. Esgotamento sanitário e resíduos sólidos","p":"As caixas de gordura e os ralos sifonados estão limpos e em bom estado de conservação?"},
  {"s":"3. Esgotamento sanitário e resíduos sólidos","p":"O descarte de resíduos é feito em recipientes com tampa e saco plástico, em local apropriado e com frequência adequada?"},
  {"s":"4. Manipulação de alimentos","p":"A recepção de matérias-primas, ingredientes e embalagens é realizada em área protegida e limpa?"},
  {"s":"4. Manipulação de alimentos","p":"São adotados critérios para avaliação e seleção dos fornecedores de matérias-primas, ingredientes e embalagens?"},
  {"s":"4. Manipulação de alimentos","p":"O transporte de matérias-primas e ingredientes é realizado em condições adequadas de higiene e conservação?"},
  {"s":"4. Manipulação de alimentos","p":"O armazenamento é feito em locais secos, limpos, arejados e protegidos de pragas e de contaminação cruzada?"},
  {"s":"4. Manipulação de alimentos","p":"Os alimentos são armazenados em estrados ou prateleiras, distantes do chão e das paredes?"},
  {"s":"4. Manipulação de alimentos","p":"O sistema PEPS (primeiro que entra, primeiro que sai) é aplicado para garantir a rotatividade dos estoques?"},
  {"s":"4. Manipulação de alimentos","p":"O dessalgue de carnes é realizado sob refrigeração ou em água corrente?"},
  {"s":"4. Manipulação de alimentos","p":"O descongelamento de alimentos é feito em refrigerador, forno de micro-ondas ou sob água corrente fria?"},
  {"s":"4. Manipulação de alimentos","p":"A manipulação de alimentos crus é feita em áreas ou bancadas separadas dos alimentos prontos, evitando contaminação cruzada?","c":true},
  {"s":"4. Manipulação de alimentos","p":"A cocção atinge temperaturas e tempos adequados para eliminar microrganismos patogênicos?","c":true},
  {"s":"4. Manipulação de alimentos","p":"O resfriamento e o reaquecimento são feitos de forma rápida e segura, evitando a zona de perigo de temperatura?","c":true},
  {"s":"4. Manipulação de alimentos","p":"Na distribuição, os alimentos quentes são mantidos acima de 60 °C e os frios abaixo de 5 °C?","c":true},
  {"s":"4. Manipulação de alimentos","p":"A exposição de alimentos para consumo imediato é feita em equipamentos que mantêm as temperaturas adequadas (estufas, balcões refrigerados)?"},
  {"s":"5. Higienização das instalações, equipamentos, móveis e utensílios","p":"Existe programa de higienização documentado, com procedimentos, frequência, produtos e responsável?"},
  {"s":"5. Higienização das instalações, equipamentos, móveis e utensílios","p":"Os saneantes são registrados na ANVISA e usados conforme as instruções do fabricante?"},
  {"s":"5. Higienização das instalações, equipamentos, móveis e utensílios","p":"Utensílios e equipamentos são higienizados antes e após cada uso, ou sempre que necessário?"},
  {"s":"5. Higienização das instalações, equipamentos, móveis e utensílios","p":"As áreas de manipulação são higienizadas após cada turno de trabalho ou sempre que necessário?"},
  {"s":"6. Controle integrado de vetores e pragas urbanas","p":"Existe programa de controle integrado de vetores e pragas urbanas, com ações preventivas e corretivas?"},
  {"s":"6. Controle integrado de vetores e pragas urbanas","p":"São adotadas medidas para evitar o acesso de pragas, como telas, portas com fechamento automático e vedação de frestas?"},
  {"s":"6. Controle integrado de vetores e pragas urbanas","p":"A aplicação de produtos químicos é feita por empresa especializada e licenciada, com registro dos produtos usados?"},
  {"s":"7. Manipuladores","p":"Os manipuladores têm atestado de saúde ocupacional (ASO) atualizado e fazem exames periódicos?"},
  {"s":"7. Manipuladores","p":"Os manipuladores recebem capacitação em higiene pessoal, manipulação de alimentos e doenças transmitidas por alimentos (DTAs)?"},
  {"s":"7. Manipuladores","p":"Os manipuladores usam uniformes limpos e adequados, incluindo touca, avental e sapatos fechados?"},
  {"s":"7. Manipuladores","p":"As mãos são lavadas e higienizadas antes das atividades, após usar o banheiro, tossir, espirrar, manusear lixo ou alimentos crus e sempre que necessário?","c":true},
  {"s":"7. Manipuladores","p":"Manipuladores com lesões nas mãos, diarreia, vômito ou outras doenças transmissíveis são afastados da manipulação?","c":true},
  {"s":"7. Manipuladores","p":"É proibido fumar, tossir ou espirrar sobre os alimentos, comer, beber ou mascar goma nas áreas de manipulação?"},
  {"s":"8. Responsável pelas atividades de manipulação","p":"Existe responsável pela operação capacitado, com comprovante de capacitação em Boas Práticas?"},
  {"s":"8. Responsável pelas atividades de manipulação","p":"O responsável supervisiona as atividades de manipulação, garantindo o cumprimento das Boas Práticas?"},
  {"s":"9. Documentação e registro","p":"O estabelecimento possui o Manual de Boas Práticas atualizado?"},
  {"s":"9. Documentação e registro","p":"Existem Procedimentos Operacionais Padronizados (POPs) para cada etapa (higienização, controle de pragas, saúde dos manipuladores etc.)?"},
  {"s":"9. Documentação e registro","p":"Os POPs estão disponíveis para os manipuladores e são de fácil compreensão?"},
  {"s":"9. Documentação e registro","p":"São mantidos registros das ações de controle (temperaturas, higienização, pragas, capacitação etc.)?"},
  {"s":"9. Documentação e registro","p":"Os registros são de fácil acesso e estão disponíveis para a fiscalização?"},
  {"s":"10. Controle de qualidade","p":"Há controle das matérias-primas, ingredientes e embalagens, com verificação de procedência, validade e armazenamento?"},
  {"s":"10. Controle de qualidade","p":"Há controle do produto final, com monitoramento de temperaturas, tempo de exposição e características sensoriais?"},
  {"s":"10. Controle de qualidade","p":"São realizadas análises laboratoriais dos alimentos e da água, quando aplicável, por laboratórios credenciados?"}
]$j$::jsonb);

select seed_platform_checklist('abertura-cozinha', 'Abertura da cozinha',
  'Conferência diária antes de começar a produção. Modelo inicial: a RT ajusta limites e itens à unidade.',
  'opening', 'daily', $j$[
  {"s":"Ambiente","p":"Piso, bancadas e equipamentos estão limpos e sem resíduos do turno anterior?"},
  {"s":"Ambiente","p":"Lixeiras com tampa e acionamento por pedal, com saco plástico e sem acúmulo?"},
  {"s":"Ambiente","p":"Telas, portas e ralos sem sinais de pragas (fezes, insetos, roeduras)?","c":true},
  {"s":"Ambiente","p":"Lavatório de mãos com sabonete antisséptico, papel toalha não reciclado e lixeira?"},
  {"s":"Temperaturas","p":"Temperatura da câmara ou geladeira de resfriados","k":"number","u":"°C","max":5,"c":true},
  {"s":"Temperaturas","p":"Temperatura do freezer ou câmara de congelados","k":"number","u":"°C","max":-18,"c":true},
  {"s":"Água","p":"A água da torneira está com aspecto, cor e odor normais?","c":true},
  {"s":"Estoque","p":"Não há alimentos vencidos ou sem identificação nas geladeiras e no estoque?","c":true},
  {"s":"Equipe","p":"Equipe uniformizada, com touca, sem adornos e com unhas curtas e sem esmalte?"}
]$j$::jsonb);

select seed_platform_checklist('higiene-manipuladores', 'Higiene dos manipuladores',
  'Conferência diária da equipe no início do turno. Modelo inicial: a RT ajusta à unidade.',
  'hygiene', 'daily', $j$[
  {"s":"Saúde","p":"Ninguém da equipe está com diarreia, vômito, febre ou lesão aberta nas mãos (ou foi afastado da manipulação)?","c":true},
  {"s":"Uniforme","p":"Uniforme limpo, de cor clara, trocado diariamente?"},
  {"s":"Uniforme","p":"Cabelos totalmente presos e protegidos por touca ou rede?"},
  {"s":"Uniforme","p":"Sapatos fechados e antiderrapantes?"},
  {"s":"Higiene pessoal","p":"Sem adornos (anéis, aliança, brincos, relógio, pulseiras, piercings)?"},
  {"s":"Higiene pessoal","p":"Unhas curtas, limpas e sem esmalte; barba feita ou protegida?"},
  {"s":"Higiene pessoal","p":"A equipe lavou e antissepsiou as mãos ao entrar na área de produção?","c":true},
  {"s":"Comportamento","p":"Ninguém come, bebe, fuma ou usa celular na área de manipulação?"}
]$j$::jsonb);

insert into schema_migrations (version) values ('0035_checklists') on conflict do nothing;

commit;
