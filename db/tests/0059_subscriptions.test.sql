-- Testes da migração 0059 (assinatura por Pix). Transação desfeita no fim.
begin;

do $$
declare
  u uuid := gen_random_uuid(); o uuid; inv uuid; ok boolean;
  payload text := '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D';
begin
  insert into directus_users (id, email) values (u, 'sub-owner@example.com');
  o := (select id from create_organization(u, 'Consultório Assinatura', 'solo', null, '123', 'CRN-9'));

  assert (select count(*) from plans where code in ('essential', 'professional', 'clinic')) = 3, 'planos pagos';
  assert (select not sellable from plans where code = 'essential'), 'plano pago nasce fora de venda';
  assert (select count(*) from platform_billing) = 1, 'configuração única';
  ok := false; begin insert into platform_billing (id) values (false);
  exception when check_violation then ok := true; end; assert ok, 'só uma linha de configuração';
  ok := false; begin update platform_billing set receiver_name = 'Nome com acento ção';
  exception when check_violation then ok := true; end; assert ok, 'nome do recebedor sem acento (padrão Pix)';

  -- sem a variável, nada grava
  ok := false; begin insert into subscriptions (organization_id, plan) values (o, 'essential');
  exception when raise_exception then ok := true; end; assert ok, 'assinatura só pela plataforma';

  perform set_config('rafanutri.billing', 'on', true);
  ok := false; begin insert into subscriptions (organization_id, plan) values (o, 'free');
  exception when check_violation then ok := true; end; assert ok, 'plano gratuito não é assinatura';
  insert into subscriptions (organization_id, plan, user_created) values (o, 'essential', u);
  ok := false; begin update subscriptions set status = 'active' where organization_id = o;
  exception when check_violation then ok := true; end; assert ok, 'ativa exige fim do período';

  insert into subscription_invoices (organization_id, plan, amount_cents, period_start, period_end, due_on, txid, pix_payload)
    values (o, 'essential', 4990, current_date, current_date + 30, current_date, 'RN1A2B3C', payload) returning id into inv;
  ok := false; begin insert into subscription_invoices (organization_id, plan, amount_cents, period_start, period_end, due_on, txid, pix_payload)
    values (o, 'essential', 4990, current_date, current_date + 30, current_date, 'RN9Z', payload);
  exception when unique_violation then ok := true; end; assert ok, 'uma fatura por período';
  ok := false; begin insert into subscription_invoices (organization_id, plan, amount_cents, period_start, period_end, due_on, txid, pix_payload)
    values (o, 'essential', 4990, current_date + 31, current_date + 60, current_date, 'RN-COM-HIFEN', payload);
  exception when check_violation then ok := true; end; assert ok, 'txid só letras e números';
  ok := false; begin update subscription_invoices set status = 'paid' where id = inv;
  exception when check_violation then ok := true; end; assert ok, 'paga exige data';
  ok := false; begin update subscription_invoices set amount_cents = 100 where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'valor não muda';
  update subscription_invoices set status = 'paid', paid_at = now(), confirmed_by = u where id = inv;
  ok := false; begin update subscription_invoices set status = 'void' where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'paga não volta';
  update subscriptions set status = 'active', current_period_end = current_date + 30 where organization_id = o;
  perform set_config('rafanutri.billing', '', true);

  ok := false; begin update subscription_invoices set reported_paid_at = now() where id = inv;
  exception when raise_exception then ok := true; end; assert ok, 'fatura só muda pela plataforma';
  ok := false; begin delete from subscriptions where organization_id = o;
  exception when raise_exception then ok := true; end; assert ok, 'assinatura não se apaga à mão';
  assert exists (select 1 from audit_logs where entity = 'subscription_invoices' and entity_id = inv::text), 'fatura auditada';

  -- Telegram de pessoas: só pelo bot
  insert into user_contact_prefs (user_id) values (u);
  ok := false; begin update user_contact_prefs set telegram_chat_id = 7 where user_id = u;
  exception when raise_exception then ok := true; end; assert ok, 'chat só pelo bot';

  -- fila aceita aviso para pessoa
  insert into notification_outbox (organization_id, user_id, kind, channel, recipient, subject, body)
    values (o, u, 'invoice_created', 'email', 'sub-owner@example.com', 'Fatura', 'Sua fatura.');

  -- apagar o consultório leva assinatura e faturas
  delete from organizations where id = o;
  assert not exists (select 1 from subscriptions where organization_id = o), 'assinatura some com o consultório';
  assert not exists (select 1 from subscription_invoices where organization_id = o), 'faturas somem com o consultório';
end $$;

rollback;
