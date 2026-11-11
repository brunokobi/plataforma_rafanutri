-- RN-031 / RN-036 — Planos alimentares por paciente. Idempotente.
-- Uma linha por plano; as refeições ficam em `meals` (jsonb), salvas de uma vez (atômico) e
-- guardadas por versão. Itens referenciam `foods.id`.
-- Regras no banco (ADR 0008, regra 3), dispensando gancho na extensão:
--   * o plano é do mesmo consultório do paciente e o autor é owner/nutricionista dele;
--   * nasce como rascunho; só um plano publicado por paciente (publicar arquiva o anterior);
--   * plano publicado não muda de conteúdo (cria-se uma nova versão); arquivado não volta.

begin;

create table if not exists meal_plans (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_id      uuid not null references patients (id) on delete cascade,
  title           text not null default 'Plano alimentar' check (length(trim(title)) between 1 and 120),
  status          text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  mode            text not null default 'quantitative' check (mode in ('quantitative', 'qualitative')),
  targets         jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  meals           jsonb not null default '[]'::jsonb check (jsonb_typeof(meals) = 'array'),
  guidelines      text check (guidelines is null or length(guidelines) <= 4000),
  totals          jsonb check (totals is null or jsonb_typeof(totals) = 'object'),
  valid_until     date,
  published_at    timestamptz,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create index if not exists meal_plans_patient on meal_plans (patient_id, status, date_created desc);
create index if not exists meal_plans_org on meal_plans (organization_id);
create unique index if not exists meal_plans_one_published on meal_plans (patient_id) where status = 'published';

create or replace function meal_plans_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'O plano nasce como rascunho' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista do consultório cria planos' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
    raise exception 'O plano não pode mudar de consultório ou de paciente' using errcode = 'P0001';
  end if;
  if old.status <> 'draft' and (
    new.meals is distinct from old.meals or new.targets is distinct from old.targets or
    new.mode is distinct from old.mode or new.guidelines is distinct from old.guidelines or new.title is distinct from old.title
  ) then
    raise exception 'Plano publicado ou arquivado não pode ser alterado: crie uma nova versão' using errcode = 'P0001';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Plano arquivado não volta a ser publicado: crie uma nova versão' using errcode = 'P0001';
  end if;
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'Plano publicado não volta a ser rascunho' using errcode = 'P0001';
  end if;

  if new.status = 'published' and old.status = 'draft' then
    -- arquiva o publicado anterior do mesmo paciente
    update meal_plans set status = 'archived' where patient_id = new.patient_id and status = 'published' and id <> new.id;
    new.published_at := now();
    new.valid_until := coalesce(new.valid_until, current_date + 30);
  end if;
  new.date_updated := now();
  return new;
end $$;

drop trigger if exists meal_plans_guard on meal_plans;
create trigger meal_plans_guard before insert or update on meal_plans
  for each row execute function meal_plans_guard();

insert into schema_migrations (version) values ('0006_meal_plans') on conflict do nothing;

commit;
