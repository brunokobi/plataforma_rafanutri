-- RN-028 — Avaliações antropométricas por paciente. Idempotente.
-- Regras no banco (ADR 0008, regra 3), dispensando gancho na extensão:
--   * a avaliação é do mesmo consultório do paciente;
--   * quem registra (user_created, preenchido pelo Directus) é owner ou nutricionista do consultório;
--   * consultório e paciente não mudam depois.
-- Os resultados (IMC, % de gordura etc.) são calculados pelo @rafanutri/nutrition-core e guardados
-- junto com o protocolo e a calc_version, para o histórico não mudar se a fórmula evoluir.

begin;

create table if not exists anthropometric_assessments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations (id) on delete cascade,
  patient_id       uuid not null references patients (id) on delete cascade,
  assessed_at      date not null default current_date check (assessed_at between date '1900-01-01' and current_date),
  age_years        numeric(5,2) check (age_years is null or age_years between 0 and 130),
  weight_kg        numeric(6,2) check (weight_kg is null or weight_kg between 1 and 400),
  height_cm        numeric(5,1) check (height_cm is null or height_cm between 30 and 250),
  waist_cm         numeric(5,1) check (waist_cm is null or waist_cm between 30 and 250),
  hip_cm           numeric(5,1) check (hip_cm is null or hip_cm between 30 and 250),
  protocol         text check (protocol is null or protocol in ('jp3', 'jp7', 'durnin_womersley', 'faulkner', 'isak')),
  density_equation text check (density_equation is null or density_equation in ('siri', 'brozek')),
  skinfolds        jsonb not null default '{}'::jsonb check (jsonb_typeof(skinfolds) = 'object'),
  results          jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  calc_version     text not null,
  notes            text check (notes is null or length(notes) <= 1000),
  user_created     uuid references directus_users (id) on delete set null,
  date_created     timestamptz not null default now(),
  date_updated     timestamptz
);

create index if not exists anthropometric_patient_date on anthropometric_assessments (patient_id, assessed_at desc);
create index if not exists anthropometric_org on anthropometric_assessments (organization_id);

create or replace function anthropometric_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A avaliação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
    return new;
  end if;

  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
  end if;
  if new.user_created is not null and not exists (
    select 1 from organization_members
    where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
  ) then
    raise exception 'Só owner ou nutricionista do consultório registra avaliações' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists anthropometric_guard on anthropometric_assessments;
create trigger anthropometric_guard before insert or update on anthropometric_assessments
  for each row execute function anthropometric_guard();

insert into schema_migrations (version) values ('0005_anthropometric_assessments') on conflict do nothing;

commit;
