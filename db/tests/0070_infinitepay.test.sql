-- Testes da 0070 (InfinitePay). Roda numa transação desfeita.
begin;
do $$
declare org uuid; u uuid := gen_random_uuid(); inv uuid;
begin
  update platform_billing set infinitepay_handle = 'rafanutri_pay';
  begin
    update platform_billing set infinitepay_handle = '$Com Espaço';
    raise exception 'FALHOU: handle inválida';
  exception when check_violation then null; end;
  insert into directus_users (id, email) values (u, 'ip@example.com');
  org := (select id from create_organization(u, 'Consultório IP', 'solo', null, '123', 'CRN-9'));
  perform set_config('rafanutri.billing', 'on', true);
  insert into subscription_invoices (organization_id, plan, amount_cents, period_start, period_end, due_on, txid, pix_payload)
    values (org, 'essential', 4990, current_date, current_date + 29, current_date, 'IPTEST1', repeat('x', 60)) returning id into inv;
  update subscription_invoices set checkout_url = 'https://checkout.infinitepay.io/rafanutri_pay/abc', gateway = 'infinitepay' where id = inv;
  begin
    update subscription_invoices set checkout_url = 'http://inseguro' where id = inv;
    raise exception 'FALHOU: link sem https';
  exception when check_violation then null; end;
  update subscription_invoices set status = 'paid', paid_at = now(), gateway_id = 'tx-123' where id = inv;
  raise notice '0070 ok';
end $$;
rollback;
