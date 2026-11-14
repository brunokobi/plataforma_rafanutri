-- RN-203/RN-204 — Acesso do paciente à área do paciente: convite por link e vínculo da conta. Idempotente.
-- Regras no banco:
--   * patients.app_user_id liga o registro do paciente (em um consultório) à conta de login dele. A mesma
--     pessoa atendida por dois consultórios tem dois registros ligados à mesma conta (RN-211);
--   * o vínculo só é gravado pelos endpoints da extensão, que ligam a variável de sessão
--     rafanutri.patient_link na transação. Assim nenhum profissional liga uma conta qualquer ao paciente
--     pela API de itens do Directus (a permissão de edição de patients cobre todos os campos);
--   * convite: token aleatório guardado só como hash, uso único, validade de até 7 dias; criado por
--     owner/nutricionista para paciente do próprio consultório; um convite pendente por paciente.
-- No Directus: papel "Paciente" com uma política que só lê o próprio usuário. Todo o resto vem dos
-- endpoints /rafanutri/me/patient e /rafanutri/public/patient-invites.

begin;

alter table patients add column if not exists app_user_id uuid references directus_users (id) on delete set null;
alter table patients add column if not exists app_activated_at timestamptz;
create unique index if not exists patients_app_user_org on patients (organization_id, app_user_id) where app_user_id is not null;
create index if not exists patients_app_user on patients (app_user_id) where app_user_id is not null;

create or replace function patients_app_link_guard() returns trigger language plpgsql as $$
begin
  if new.app_user_id is distinct from old.app_user_id or new.app_activated_at is distinct from old.app_activated_at then
    -- cascata (conta apagada → set null) passa; o resto só pelos endpoints
    if pg_trigger_depth() = 1 and coalesce(current_setting('rafanutri.patient_link', true), '') <> 'on' then
      raise exception 'O acesso do paciente só muda pelo convite ou pela revogação' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists patients_app_link_guard on patients;
create trigger patients_app_link_guard before update on patients
  for each row execute function patients_app_link_guard();

create or replace function patients_app_link_insert_guard() returns trigger language plpgsql as $$
begin
  if (new.app_user_id is not null or new.app_activated_at is not null)
     and coalesce(current_setting('rafanutri.patient_link', true), '') <> 'on' then
    raise exception 'O acesso do paciente só muda pelo convite ou pela revogação' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists patients_app_link_insert_guard on patients;
create trigger patients_app_link_insert_guard before insert on patients
  for each row execute function patients_app_link_insert_guard();

create table if not exists patient_app_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  email           text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at      timestamptz not null,
  used_at         timestamptz,
  used_by         uuid references directus_users (id) on delete set null,
  revoked_at      timestamptz,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now()
);

create unique index if not exists patient_app_invites_pending on patient_app_invites (patient_id)
  where used_at is null and revoked_at is null;

create or replace function patient_app_invites_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório convida pacientes' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem convite' using errcode = 'P0001';
    end if;
    new.email := lower(trim(new.email));
    new.used_at := null; new.used_by := null; new.revoked_at := null;
    new.date_created := now();
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '7 days');
    return new;
  end if;
  -- UPDATE: só marcar uso ou revogação, uma vez
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.email <> old.email
     or new.token_hash <> old.token_hash or new.expires_at <> old.expires_at or new.date_created <> old.date_created
     or new.user_created is distinct from old.user_created then
    raise exception 'O convite não pode ser alterado' using errcode = 'P0001';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Convite já usado ou revogado' using errcode = 'P0001';
  end if;
  if new.used_at is not null and new.revoked_at is not null and old.used_at is null then
    raise exception 'Convite revogado não pode ser usado' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists patient_app_invites_guard on patient_app_invites;
create trigger patient_app_invites_guard before insert or update on patient_app_invites
  for each row execute function patient_app_invites_guard();

-- Papel "Paciente" no Directus (só quando as tabelas do Directus existem; nos testes há só stubs)
do $$
begin
  if to_regclass('directus_roles') is null or to_regclass('directus_policies') is null then
    return;
  end if;
  insert into directus_policies (id, name, icon, description, app_access, admin_access, enforce_tfa)
  values ('5d1c7a3e-0001-4b6e-9a01-7e2a0c9a0001', 'Paciente - próprio usuário', 'favorite',
          'RN-204: conta do paciente. Só lê o próprio usuário; os dados vêm dos endpoints /rafanutri/me/patient.', false, false, false)
  on conflict (id) do nothing;
  insert into directus_roles (id, name, icon, description)
  values ('5d1c7a3e-0002-4b6e-9a01-7e2a0c9a0002', 'Paciente', 'favorite', 'Pacientes com acesso à área do paciente (RN-204)')
  on conflict (id) do nothing;
  insert into directus_access (id, role, "user", policy, sort)
  values ('5d1c7a3e-0003-4b6e-9a01-7e2a0c9a0003', '5d1c7a3e-0002-4b6e-9a01-7e2a0c9a0002', null, '5d1c7a3e-0001-4b6e-9a01-7e2a0c9a0001', 1)
  on conflict (id) do nothing;
  if not exists (select 1 from directus_permissions where policy = '5d1c7a3e-0001-4b6e-9a01-7e2a0c9a0001' and collection = 'directus_users' and action = 'read') then
    insert into directus_permissions (collection, action, permissions, fields, policy)
    values ('directus_users', 'read', '{"id":{"_eq":"$CURRENT_USER"}}', 'id,email,first_name,last_name', '5d1c7a3e-0001-4b6e-9a01-7e2a0c9a0001');
  end if;
end $$;

insert into schema_migrations (version) values ('0018_patient_app_access') on conflict do nothing;

commit;
