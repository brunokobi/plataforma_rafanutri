-- Assistente de IA: registro de uso para a cota diária por consultório. Não guarda texto enviado nem resposta.
begin;

create table if not exists ai_requests (
  id                bigserial primary key,
  organization_id   uuid not null references organizations (id) on delete cascade,
  user_id           uuid references directus_users (id) on delete set null,
  kind              text not null check (kind in ('question', 'recipes', 'anamnesis_summary', 'plan_suggestion')),
  model             text check (model is null or length(model) <= 120),
  patient_id        uuid references patients (id) on delete set null,
  prompt_tokens     integer,
  completion_tokens integer,
  status            text not null check (status in ('ok', 'error')),
  created_at        timestamptz not null default now()
);

create index if not exists ai_requests_org_time on ai_requests (organization_id, created_at desc);

insert into schema_migrations (version) values ('0063_ai_requests') on conflict do nothing;

commit;
