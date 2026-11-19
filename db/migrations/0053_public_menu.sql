-- U7 — Cardápio publicado para o comensal e pesquisa de satisfação (RN-223). Idempotente.
--
-- Decisões:
-- - Cada unidade pode publicar o cardápio num link público com token aleatório (trocável), sem dados
--   internos: a página pública lê só pelo endpoint, que devolve nome do prato, alergênicos e nutrientes.
-- - Pesquisa por unidade (uma ativa), de 1 a 3 perguntas (estrelas 1–5 ou sim/não); resposta ligada ao dia
--   e, opcionalmente, à preparação. Antispam: uma resposta por aparelho (hash) por dia e preparação, e
--   limite por IP no endpoint. Respostas não mudam.

begin;

alter table production_units add column if not exists public_menu_token text;
alter table production_units add column if not exists public_menu_enabled boolean not null default false;
create unique index if not exists production_units_public_menu_token on production_units (public_menu_token) where public_menu_token is not null;
do $$ begin
  alter table production_units add constraint production_units_public_menu_token_fmt check (public_menu_token is null or public_menu_token ~ '^[A-Za-z0-9_-]{22,64}$');
exception when duplicate_object then null; end $$;

/** Liga ou desliga o cardápio público; ao ligar sem token (ou com p_rotate), gera um novo. Devolve o token. */
create or replace function unit_public_menu_set(p_unit uuid, p_enabled boolean, p_rotate boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  select public_menu_token into tok from production_units where id = p_unit for update;
  if not found then raise exception 'Unidade não encontrada' using errcode = 'P0001'; end if;
  if p_enabled and (tok is null or p_rotate) then
    tok := left(translate(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'base64'), '+/', '-_'), 32);
  end if;
  update production_units set public_menu_enabled = p_enabled, public_menu_token = tok where id = p_unit;
  return tok;
end $$;

create table if not exists satisfaction_surveys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  title           text not null default 'Como foi a sua refeição?' check (char_length(btrim(title)) between 3 and 120),
  questions       jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 3),
  per_dish        boolean not null default true,
  active          boolean not null default true,
  created_by      uuid references directus_users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index if not exists satisfaction_surveys_one_active on satisfaction_surveys (unit_id) where active;

create or replace function satisfaction_surveys_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.unit_id <> old.unit_id then raise exception 'A pesquisa não muda de unidade' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and new.questions <> old.questions and exists (select 1 from satisfaction_responses where survey_id = old.id) then
    raise exception 'A pesquisa já tem respostas; crie outra' using errcode = 'P0001';
  end if;
  new.organization_id := (select organization_id from production_units where id = new.unit_id);
  if tg_op = 'INSERT' and not org_has_module(new.organization_id, 'uan') then
    raise exception 'O módulo UAN não está habilitado para esta organização' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(new.questions) q
              where jsonb_typeof(q) <> 'object' or coalesce(q ->> 'kind', '') not in ('stars', 'yes_no')
                 or char_length(btrim(coalesce(q ->> 'text', ''))) not between 3 and 160) then
    raise exception 'Cada pergunta precisa de texto (3 a 160) e tipo estrelas ou sim/não' using errcode = 'P0001';
  end if;
  return new;
end $$;

create table if not exists satisfaction_responses (
  id              bigserial primary key,
  organization_id uuid not null references organizations (id) on delete cascade,
  unit_id         uuid not null references production_units (id) on delete cascade,
  survey_id       uuid not null references satisfaction_surveys (id) on delete cascade,
  served_on       date not null,
  sheet_root_id   uuid references tech_sheets (id) on delete set null,
  device_hash     text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  answers         jsonb not null check (jsonb_typeof(answers) = 'array'),
  rating          smallint check (rating is null or rating between 1 and 5),
  comment         text check (comment is null or char_length(comment) <= 500),
  created_at      timestamptz not null default now()
);
create unique index if not exists satisfaction_responses_once
  on satisfaction_responses (survey_id, device_hash, served_on, coalesce(sheet_root_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists satisfaction_responses_unit on satisfaction_responses (unit_id, served_on desc);

drop trigger if exists satisfaction_surveys_guard on satisfaction_surveys;
create trigger satisfaction_surveys_guard before insert or update on satisfaction_surveys for each row execute function satisfaction_surveys_guard();

-- Resposta: unidade e empresa da pesquisa; respostas batem com as perguntas; nota = média das estrelas.
create or replace function satisfaction_responses_guard() returns trigger language plpgsql as $$
declare s satisfaction_surveys; q jsonb; a jsonb; i integer; stars numeric := 0; n integer := 0;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'sheet_root_id') = (to_jsonb(old) - 'sheet_root_id') then return new; end if; -- FK set null
    raise exception 'Resposta não se altera' using errcode = 'P0001';
  end if;
  select * into s from satisfaction_surveys where id = new.survey_id;
  if s.id is null or not s.active then raise exception 'Pesquisa encerrada' using errcode = 'P0001'; end if;
  new.unit_id := s.unit_id; new.organization_id := s.organization_id; new.created_at := now();
  if jsonb_array_length(new.answers) <> jsonb_array_length(s.questions) then
    raise exception 'Responda todas as perguntas' using errcode = 'P0001';
  end if;
  for i in 0 .. jsonb_array_length(s.questions) - 1 loop
    q := s.questions -> i; a := new.answers -> i;
    if q ->> 'kind' = 'stars' then
      if jsonb_typeof(a) <> 'number' or (a::text)::numeric not in (1, 2, 3, 4, 5) then raise exception 'Nota de 1 a 5' using errcode = 'P0001'; end if;
      stars := stars + (a::text)::numeric; n := n + 1;
    elsif jsonb_typeof(a) <> 'boolean' then
      raise exception 'Responda sim ou não' using errcode = 'P0001';
    end if;
  end loop;
  new.rating := case when n > 0 then round(stars / n) end;
  if new.sheet_root_id is not null and not exists (select 1 from tech_sheets where id = new.sheet_root_id and organization_id = s.organization_id) then
    raise exception 'Preparação de outra empresa' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists satisfaction_responses_guard on satisfaction_responses;
create trigger satisfaction_responses_guard before insert or update on satisfaction_responses for each row execute function satisfaction_responses_guard();

do $$
begin
  drop trigger if exists satisfaction_surveys_audit on satisfaction_surveys;
  create trigger satisfaction_surveys_audit after insert or update or delete on satisfaction_surveys for each row execute function audit_trigger();
end $$;

insert into schema_migrations (version) values ('0053_public_menu') on conflict do nothing;

commit;
