-- Saúde pública, bloco A (RN-170 a RN-174): triagens nutricionais. Idempotente.
--   * organizations.modules passa a aceitar todos os módulos do catálogo (habilitação por contrato);
--   * nutrition_screenings: uma linha por triagem (NRS-2002, MUST, ASG; MNA reservada até a licença do formulário),
--     com as respostas, a pontuação e a classificação calculadas pelo @rafanutri/nutrition-core; auditada.
-- Acesso: consultórios com o módulo public_health (contrato); conferido nos endpoints (directus/extensions/rafanutri/public-health.js).

begin;

alter table organizations drop constraint if exists organizations_modules_check;
alter table organizations add constraint organizations_modules_check
  check (modules <@ '{clinical,patient_area,practice,ai,maternal,uan,public_health}' and cardinality(modules) >= 1);

create table if not exists nutrition_screenings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  tool            text not null check (tool in ('nrs_2002', 'must', 'sga', 'mna_sf', 'mna_full')),
  tool_version    text not null check (tool_version ~ '^[a-z0-9_]+@[a-z0-9_]+$'),
  answers         jsonb not null check (jsonb_typeof(answers) = 'object'),
  score           numeric(5, 2),
  classification  text not null check (classification ~ '^[A-Za-z_]{1,40}$'),
  risk_level      text not null check (risk_level in ('low', 'medium', 'high')),
  screened_at     timestamptz not null default now(),
  screened_by     uuid references directus_users (id) on delete set null,
  notes           text check (notes is null or length(notes) <= 1000),
  date_created    timestamptz not null default now()
);
create index if not exists nutrition_screenings_patient on nutrition_screenings (patient_id, screened_at desc);
create index if not exists nutrition_screenings_org on nutrition_screenings (organization_id, tool, screened_at desc);

create or replace function nutrition_screenings_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Triagem registrada não muda: registre uma nova' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  if new.screened_by is null or not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.screened_by and role in ('owner', 'nutritionist')
  ) then
    raise exception 'Só owner ou nutricionista do consultório registra triagens' using errcode = 'P0001';
  end if;
  if new.screened_at > now() + interval '5 minutes' then
    raise exception 'Data da triagem no futuro' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists nutrition_screenings_guard on nutrition_screenings;
create trigger nutrition_screenings_guard before insert or update on nutrition_screenings for each row execute function nutrition_screenings_guard();
drop trigger if exists nutrition_screenings_audit on nutrition_screenings;
create trigger nutrition_screenings_audit after insert or update or delete on nutrition_screenings for each row execute function audit_trigger();

insert into schema_migrations (version) values ('0066_public_health') on conflict do nothing;

commit;
