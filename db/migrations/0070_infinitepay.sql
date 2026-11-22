-- InfinitePay (Checkout Integrado) para a assinatura da plataforma. Idempotente.
--   * platform_billing.infinitepay_handle: InfiniteTag da conta (pessoa física, sem mensalidade, Pix grátis).
--     Vazio = continua só o Pix estático com confirmação manual;
--   * subscription_invoices.checkout_url: link de pagamento da fatura (Pix ou cartão na página da InfinitePay).
--     gateway = 'infinitepay' e gateway_id = transaction_nsu do pagamento confirmado (colunas da 0059).

begin;

alter table platform_billing add column if not exists infinitepay_handle text;
alter table subscription_invoices add column if not exists checkout_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'platform_billing_infinitepay_handle_check') then
    alter table platform_billing add constraint platform_billing_infinitepay_handle_check
      check (infinitepay_handle is null or infinitepay_handle ~ '^[a-z0-9][a-z0-9_.-]{1,39}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'subscription_invoices_checkout_url_check') then
    alter table subscription_invoices add constraint subscription_invoices_checkout_url_check
      check (checkout_url is null or (checkout_url ~ '^https://' and char_length(checkout_url) <= 600));
  end if;
end $$;

insert into schema_migrations (version) values ('0070_infinitepay') on conflict do nothing;

commit;
