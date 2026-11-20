-- Aceite dos documentos legais (Termos do profissional, Termos do paciente, Política de Privacidade). Idempotente.
--
-- Decisões:
-- - Um registro por pessoa, documento e versão; não muda (prova do aceite). Some só com a conta.
-- - A versão vigente fica no app e na extensão; documento novo = versão nova = novo aceite ao entrar.

begin;

create table if not exists terms_acceptances (
  id          bigserial primary key,
  user_id     uuid not null references directus_users (id) on delete cascade,
  document    text not null check (document in ('professional_terms', 'patient_terms', 'privacy')),
  version     text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  unique (user_id, document, version)
);

create or replace function terms_acceptances_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'Aceite registrado não se altera' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' and exists (select 1 from directus_users where id = old.user_id) then
    raise exception 'Aceite registrado não se apaga' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists terms_acceptances_guard on terms_acceptances;
create trigger terms_acceptances_guard before update or delete on terms_acceptances for each row execute function terms_acceptances_guard();

insert into schema_migrations (version) values ('0057_terms_acceptances') on conflict do nothing;

commit;
