-- RN-053 — Financeiro: categorias, lançamentos (receitas e despesas) e fluxo de caixa. Idempotente.
-- Lidos e gravados só pelos endpoints /rafanutri/finance da extensão; nenhum papel do Directus tem permissão de coleção.
-- Regras no banco:
--   * valores sempre em centavos (inteiro > 0);
--   * qualquer membro do consultório (owner, nutricionista, assistente) lança e edita; o autor não muda;
--   * excluir só owner ou nutricionista: o endpoint informa quem é pela variável de sessão rafanutri.actor
--     (sem ela, ninguém exclui; cancelar é o caminho do assistente);
--   * categoria do mesmo tipo (receita/despesa) e da plataforma ou do próprio consultório;
--   * paciente e consulta do mesmo consultório (a consulta precisa ser do paciente informado);
--   * pago ⇔ data de pagamento; uma consulta tem no máximo um recebimento não cancelado.

begin;

create table if not exists financial_categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade, -- null = padrão da plataforma
  kind            text not null check (kind in ('income', 'expense')),
  name            text not null check (length(trim(name)) between 2 and 40),
  archived        boolean not null default false,
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now()
);

create unique index if not exists financial_categories_name on financial_categories (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, lower(name));

create or replace function financial_categories_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then
      if new.user_created is not null then
        raise exception 'Categorias padrão só são criadas pela equipe da Rafanutri' using errcode = 'P0001';
      end if;
    elsif new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
      raise exception 'Só owner ou nutricionista cria categorias' using errcode = 'P0001';
    end if;
  elsif new.organization_id is distinct from old.organization_id or new.kind <> old.kind then
    raise exception 'A categoria não muda de consultório nem de tipo' using errcode = 'P0001';
  end if;
  new.name := trim(new.name);
  return new;
end $$;

drop trigger if exists financial_categories_guard on financial_categories;
create trigger financial_categories_guard before insert or update on financial_categories
  for each row execute function financial_categories_guard();

-- Categorias padrão
insert into financial_categories (organization_id, kind, name) values
  (null, 'income', 'Consulta'), (null, 'income', 'Retorno'), (null, 'income', 'Pacote'), (null, 'income', 'Outros recebimentos'),
  (null, 'expense', 'Aluguel'), (null, 'expense', 'Software'), (null, 'expense', 'Marketing'), (null, 'expense', 'Impostos'),
  (null, 'expense', 'Material'), (null, 'expense', 'Outras despesas')
on conflict do nothing;

create table if not exists financial_transactions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  kind            text not null check (kind in ('income', 'expense')),
  category_id     uuid not null references financial_categories (id),
  description     text not null check (length(trim(description)) between 2 and 200),
  amount_cents    bigint not null check (amount_cents > 0 and amount_cents <= 10000000000),
  due_date        date not null,
  status          text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_at         date,
  payment_method  text check (payment_method in ('pix', 'cash', 'debit', 'credit', 'transfer', 'boleto', 'other')),
  patient_id      uuid references patients (id) on delete set null,
  appointment_id  uuid references appointments (id) on delete set null,
  notes           text check (notes is null or length(notes) <= 500),
  user_created    uuid references directus_users (id) on delete set null,
  date_created    timestamptz not null default now(),
  date_updated    timestamptz,
  check ((status = 'paid') = (paid_at is not null)),
  check (kind = 'income' or (patient_id is null and appointment_id is null))
);

create index if not exists financial_transactions_org_due on financial_transactions (organization_id, due_date);
create index if not exists financial_transactions_org_paid on financial_transactions (organization_id, paid_at) where status = 'paid';
create unique index if not exists financial_transactions_appointment on financial_transactions (appointment_id) where appointment_id is not null and status <> 'cancelled';

create or replace function financial_transactions_guard() returns trigger language plpgsql as $$
declare
  cat financial_categories;
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1 from organization_members
      where organization_id = old.organization_id and role in ('owner', 'nutritionist')
        and user_id::text = coalesce(current_setting('rafanutri.actor', true), '')
    ) then
      raise exception 'Só owner ou nutricionista exclui lançamentos' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created
    ) then
      raise exception 'Só membros do consultório lançam no financeiro' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
  else
    if new.organization_id <> old.organization_id or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
      raise exception 'O lançamento não muda de consultório nem de autor' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;

  select * into cat from financial_categories where id = new.category_id;
  if cat.id is null or cat.kind <> new.kind or (cat.organization_id is not null and cat.organization_id <> new.organization_id) then
    raise exception 'Categoria inválida para este lançamento' using errcode = 'P0001';
  end if;
  if new.patient_id is not null and not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente de outro consultório' using errcode = 'P0001';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from appointments where id = new.appointment_id and organization_id = new.organization_id
      and (new.patient_id is null or patient_id = new.patient_id)
  ) then
    raise exception 'Consulta de outro consultório ou de outro paciente' using errcode = 'P0001';
  end if;
  new.description := trim(new.description);
  return new;
end $$;

drop trigger if exists financial_transactions_guard on financial_transactions;
create trigger financial_transactions_guard before insert or update or delete on financial_transactions
  for each row execute function financial_transactions_guard();

-- Fluxo de caixa mensal (regime de caixa: só o que foi pago, pelo mês do pagamento)
create or replace view monthly_cash_flow as
select organization_id,
       date_trunc('month', paid_at)::date as month,
       coalesce(sum(amount_cents) filter (where kind = 'income'), 0)::bigint as income_cents,
       coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)::bigint as expense_cents,
       (coalesce(sum(amount_cents) filter (where kind = 'income'), 0) - coalesce(sum(amount_cents) filter (where kind = 'expense'), 0))::bigint as balance_cents
from financial_transactions
where status = 'paid'
group by organization_id, date_trunc('month', paid_at);

insert into schema_migrations (version) values ('0024_finance') on conflict do nothing;

commit;
