-- Plano anual com 50% de desconto (assinatura por Pix, 0059). Idempotente.
--   * plans.annual_price_cents: preço do ano (padrão: 6 mensalidades = 12 meses com 50% de desconto);
--   * subscriptions.billing_cycle (mensal ou anual) e next_billing_cycle (troca agendada para a próxima fatura);
--   * subscription_invoices.billing_cycle: a fatura anual cobre 12 meses. O ciclo da fatura não muda depois de emitida.

begin;

alter table plans add column if not exists annual_price_cents integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plans_annual_price_check') then
    alter table plans add constraint plans_annual_price_check check (annual_price_cents is null or annual_price_cents between 100 and 100000000);
  end if;
end $$;
update plans set annual_price_cents = price_cents * 6 where code in ('essential', 'professional', 'clinic') and price_cents >= 100 and annual_price_cents is null;

alter table subscriptions add column if not exists billing_cycle text not null default 'monthly';
alter table subscriptions add column if not exists next_billing_cycle text;
alter table subscription_invoices add column if not exists billing_cycle text not null default 'monthly';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_billing_cycle_check') then
    alter table subscriptions add constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly', 'annual') and (next_billing_cycle is null or next_billing_cycle in ('monthly', 'annual')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_invoices_billing_cycle_check') then
    alter table subscription_invoices add constraint subscription_invoices_billing_cycle_check check (billing_cycle in ('monthly', 'annual'));
  end if;
end $$;

-- O ciclo da fatura emitida não muda (como o valor e o período)
create or replace function billing_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('rafanutri.billing', true), '') <> 'on' and pg_trigger_depth() = 1 then
    raise exception 'Assinatura e faturas só mudam pela plataforma' using errcode = 'P0001';
  end if;
  if tg_table_name = 'subscription_invoices' and tg_op = 'UPDATE' then
    if old.status = 'paid' and (new.status <> 'paid' or new.amount_cents <> old.amount_cents or new.paid_at <> old.paid_at) then
      raise exception 'Fatura paga não muda' using errcode = 'P0001';
    end if;
    if old.status = 'void' and new.status <> 'void' then
      raise exception 'Fatura cancelada não volta' using errcode = 'P0001';
    end if;
    if new.amount_cents <> old.amount_cents or new.period_start <> old.period_start or new.organization_id <> old.organization_id or new.txid <> old.txid
       or new.billing_cycle <> old.billing_cycle then
      raise exception 'Valor, período, ciclo e identificador da fatura não mudam' using errcode = 'P0001';
    end if;
  end if;
  if tg_table_name = 'subscriptions' and tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

insert into schema_migrations (version) values ('0069_annual_billing') on conflict do nothing;

commit;
