-- Testes da migração 0025 (recibos). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0025_receipts.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  cin uuid; cex uuid; t1 uuid; t2 uuid; t3 uuid; tb uuid; r1 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'rec-a@example.com'), (u2, 'rec-b@example.com');
  o1 := create_organization(u1, 'Consultório Recibo A', 'solo', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Recibo B', 'solo', null, '2', 'CRN-2');
  select id into cin from financial_categories where organization_id is null and kind = 'income' and name = 'Consulta';
  select id into cex from financial_categories where organization_id is null and kind = 'expense' and name = 'Aluguel';
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, payment_method, user_created)
    values (o1.id, 'income', cin, 'Consulta', 25000, '2026-03-10', 'paid', '2026-03-10', 'pix', u1) returning id into t1;
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, user_created)
    values (o1.id, 'income', cin, 'Retorno', 18000, '2026-03-11', 'paid', '2026-03-11', u1) returning id into t2;
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created)
    values (o1.id, 'income', cin, 'Em aberto', 100, '2026-03-12', u1) returning id into t3;
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, user_created)
    values (o2.id, 'income', cin, 'De B', 100, '2026-03-12', 'paid', '2026-03-12', u2) returning id into tb;

  -- CPF/CNPJ do emitente
  update organizations set receipt_tax_id = '12345678901' where id = o1.id;
  ok := false; begin update organizations set receipt_tax_id = '123.456.789-01' where id = o1.id;
  exception when check_violation then ok := true; end; assert ok, 'só dígitos (11 ou 14)';

  -- Numeração por consultório; dados copiados do lançamento (o cliente não forja valor nem número)
  insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, t1, 999, 1, '2000-01-01', 'Consulta de nutrição', 'João', 'Ana', 'Consultório Recibo A', u1) returning id into r1;
  assert (select number = 1 and amount_cents = 25000 and paid_at = '2026-03-10' and payment_method = 'pix' from receipts where id = r1), 'número 1 e valores do lançamento';
  insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, t2, 0, 1, '2000-01-01', 'Retorno', 'Maria', 'Ana', 'Consultório Recibo A', u1);
  assert (select max(number) = 2 from receipts where organization_id = o1.id), 'segundo recibo é 2';
  insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o2.id, tb, 0, 1, '2000-01-01', 'Consulta', 'Pedro', 'Bia', 'Consultório Recibo B', u2);
  assert (select number = 1 from receipts where organization_id = o2.id), 'outro consultório começa do 1';

  -- Um recibo por lançamento; só pago e receita; só membros
  ok := false; begin insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, t1, 0, 1, '2000-01-01', 'Outra', 'João', 'Ana', 'A', u1);
  exception when unique_violation then ok := true; end; assert ok, 'um recibo por lançamento';
  ok := false; begin insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, t3, 0, 1, '2000-01-01', 'Aberto', 'João', 'Ana', 'A', u1);
  exception when others then ok := sqlerrm like '%Recibo só de recebimento pago%'; end; assert ok, 'em aberto não tem recibo';
  ok := false; begin insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, tb, 0, 1, '2000-01-01', 'De B', 'João', 'Ana', 'A', u1);
  exception when others then ok := sqlerrm like '%Recibo só de recebimento pago%'; end; assert ok, 'lançamento de outro consultório';
  ok := false; begin insert into receipts (organization_id, transaction_id, number, amount_cents, paid_at, service, payer_name, issuer_name, practice_name, user_created)
    values (o1.id, t3, 0, 1, '2000-01-01', 'Intruso', 'João', 'Ana', 'A', u2);
  exception when others then ok := sqlerrm like '%Recibo só%' or sqlerrm like '%Só membros%'; end; assert ok, 'intruso';

  -- Imutável; lançamento com recibo não é excluído
  ok := false; begin update receipts set payer_name = 'Outro' where id = r1;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'recibo não muda';
  ok := false; begin delete from receipts where id = r1;
  exception when others then ok := sqlerrm like '%não é apagado%'; end; assert ok, 'recibo não é apagado';
  perform set_config('rafanutri.actor', u1::text, true);
  ok := false; begin delete from financial_transactions where id = t1;
  exception when foreign_key_violation then ok := true; end; assert ok, 'lançamento com recibo não é excluído';
  perform set_config('rafanutri.actor', '', true);

  -- Apagar o consultório leva recibos e lançamentos
  delete from organizations where id = o2.id;
  assert not exists (select 1 from receipts where organization_id = o2.id), 'cascata do consultório';

  raise notice '0025_receipts: todos os testes passaram';
end $$;

rollback;
