-- Testes da 0069 (plano anual). Roda numa transação desfeita.
begin;
do $$
declare org uuid; u uuid := gen_random_uuid(); inv uuid;
begin
  insert into directus_users (id, email) values (u, 'anual@example.com');
  org := (select id from create_organization(u, 'Consultório Anual', 'solo', null, '123', 'CRN-9'));
  update plans set price_cents = 4990, annual_price_cents = 29940, sellable = true where code = 'essential';
  if (select annual_price_cents from plans where code = 'essential') <> 29940 then raise exception 'FALHOU: preço anual'; end if;
  begin
    update plans set annual_price_cents = 50 where code = 'essential';
    raise exception 'FALHOU: preço anual baixo demais';
  exception when check_violation then null; end;

  perform set_config('rafanutri.billing', 'on', true);
  insert into subscriptions (organization_id, plan, status, billing_cycle) values (org, 'essential', 'pending', 'annual');
  insert into subscription_invoices (organization_id, plan, amount_cents, period_start, period_end, due_on, txid, pix_payload, billing_cycle)
    values (org, 'essential', 29940, current_date, (current_date + interval '1 year' - interval '1 day')::date, current_date, 'ANUAL1', repeat('x', 60), 'annual') returning id into inv;
  begin
    update subscriptions set billing_cycle = 'weekly' where organization_id = org;
    raise exception 'FALHOU: ciclo inválido';
  exception when check_violation then null; end;
  begin
    update subscription_invoices set billing_cycle = 'monthly' where id = inv;
    raise exception 'FALHOU: ciclo da fatura mudou';
  exception when sqlstate 'P0001' then null; end;
  perform set_config('rafanutri.billing', '', true);
  begin
    update subscriptions set billing_cycle = 'monthly' where organization_id = org;
    raise exception 'FALHOU: assinatura mudou fora da plataforma';
  exception when sqlstate 'P0001' then null; end;
  raise notice '0069 ok';
end $$;
rollback;
