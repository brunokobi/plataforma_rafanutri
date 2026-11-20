-- Administrador da plataforma (tela de contratos UAN). Idempotente.
--
-- Decisões:
-- - Admin da plataforma = administrador do Directus (política com admin_access) ou pessoa listada em
--   platform_admins (acesso só às telas de administração da Rafanutri, sem virar admin do Directus).
-- - platform_admins nasce vazia; inclusão só por SQL.

begin;

create table if not exists platform_admins (
  user_id    uuid primary key references directus_users (id) on delete cascade,
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create or replace function is_platform_admin(p_user uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if exists (select 1 from platform_admins where user_id = p_user) then return true; end if;
  if to_regclass('directus_access') is null or to_regclass('directus_policies') is null then return false; end if;
  execute 'select exists (select 1 from directus_users u join directus_access a on (a."user" = u.id or a.role = u.role)
                            join directus_policies p on p.id = a.policy where u.id = $1 and p.admin_access)'
     into ok using p_user;
  return coalesce(ok, false);
end $$;

insert into schema_migrations (version) values ('0056_platform_admins') on conflict do nothing;

commit;
