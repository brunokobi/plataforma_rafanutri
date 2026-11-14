-- RN-200/RN-202 — Lista de interesse no plano pago. Idempotente.
-- O plano da organização continua em organizations.plan (só 'free' no MVP); a tabela de assinaturas
-- (subscriptions) entra com a cobrança (RN-057). Lida e gravada pelos endpoints /rafanutri/plan.
-- Regras no banco: um registro por consultório; só o owner registra; o interesse não muda de consultório.

begin;

create table if not exists plan_waitlist (
  organization_id uuid primary key references organizations (id) on delete cascade,
  user_id         uuid references directus_users (id) on delete set null,
  desired_plan    text check (desired_plan in ('essential', 'professional', 'clinic')),
  note            text check (note is null or length(note) <= 500),
  active_patients integer not null default 0,  -- uso no momento do interesse (métrica do RN-214)
  date_created    timestamptz not null default now(),
  date_updated    timestamptz
);

create or replace function plan_waitlist_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'O interesse não pode mudar de consultório' using errcode = 'P0001';
  end if;
  if new.user_id is null or not exists (
    select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_id and role = 'owner'
  ) then
    raise exception 'Só o owner do consultório registra interesse no plano pago' using errcode = 'P0001';
  end if;
  new.note := nullif(trim(new.note), '');
  if tg_op = 'UPDATE' then
    new.date_created := old.date_created;
    new.date_updated := now();
  end if;
  return new;
end $$;

drop trigger if exists plan_waitlist_guard on plan_waitlist;
create trigger plan_waitlist_guard before insert or update on plan_waitlist
  for each row execute function plan_waitlist_guard();

insert into schema_migrations (version) values ('0017_plan_waitlist') on conflict do nothing;

commit;
