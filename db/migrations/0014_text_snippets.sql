-- RN-045 — Orientações e textos reutilizáveis. Idempotente.
-- Lidos e gravados pelos endpoints /rafanutri/snippets da extensão (consultório do usuário logado);
-- não há permissão de coleção no Directus para o papel Profissional.
-- Regras no banco:
--   * texto sem consultório = biblioteca da plataforma, só por seed (sem autor), escrita pela nutricionista;
--   * texto do consultório: autor owner/nutricionista; não muda de consultório.

begin;

create table if not exists text_snippets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  category        text not null check (length(trim(category)) between 2 and 40),
  title           text not null check (length(trim(title)) between 2 and 80),
  body            text not null check (length(trim(body)) between 2 and 2000),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create index if not exists text_snippets_org on text_snippets (organization_id, category);

create or replace function text_snippets_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then
      if new.user_created is not null then
        raise exception 'Textos da biblioteca da plataforma só são criados pela equipe da Rafanutri' using errcode = 'P0001';
      end if;
    elsif new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria textos' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception 'O texto não pode mudar de consultório' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  new.category := trim(new.category);
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $$;

drop trigger if exists text_snippets_guard on text_snippets;
create trigger text_snippets_guard before insert or update on text_snippets
  for each row execute function text_snippets_guard();

insert into schema_migrations (version) values ('0014_text_snippets') on conflict do nothing;

commit;
