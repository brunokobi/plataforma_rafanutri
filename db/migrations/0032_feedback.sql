-- RN-047 — Feedback do programa beta. Idempotente.
-- Gravado só pelo endpoint POST /rafanutri/feedback (qualquer conta de profissional logada); lido só pelo
-- administrador da plataforma no Directus (nenhum papel tem permissão na coleção).
-- Sem print de tela: a tela costuma ter dados de pacientes. Guarda só o caminho da página (sem query string).

begin;

create table if not exists product_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  user_id uuid references directus_users(id) on delete set null,
  kind text not null default 'other' check (kind in ('bug', 'idea', 'praise', 'other')),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  page text check (page is null or (char_length(page) <= 200 and page ~ '^/[^?#]*$')),
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  date_created timestamptz not null default now()
);

create index if not exists product_feedback_user_created on product_feedback (user_id, date_created desc);
create index if not exists product_feedback_status_created on product_feedback (status, date_created desc);

insert into schema_migrations (version) values ('0032_feedback') on conflict do nothing;

commit;
