-- Testes da migração 0024 (financeiro). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0024_finance.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  ua uuid := gen_random_uuid();
  o1 organizations; o2 organizations;
  p1 uuid; p2 uuid; ap uuid; ap2 uuid; cin uuid; cex uuid; cown uuid; t1 uuid; t2 uuid; ok boolean;
begin
  insert into directus_users (id, email) values (u1, 'fin-a@example.com'), (u2, 'fin-b@example.com'), (ua, 'fin-assist@example.com');
  o1 := create_organization(u1, 'Consultório Fin A', 'clinic', null, '1', 'CRN-1');
  o2 := create_organization(u2, 'Consultório Fin B', 'solo', null, '2', 'CRN-2');
  insert into plans (code, name, max_active_patients, max_members, price_cents) values ('teste-fin', 'Teste', 100, 5, 0);
  update organizations set plan = 'teste-fin' where id = o1.id; -- plano com mais de um membro (desfeito no fim)
  insert into organization_members (organization_id, user_id, role) values (o1.id, ua, 'assistant');
  insert into patients (organization_id, responsible_user_id, full_name) values (o1.id, u1, 'Paciente Um') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name) values (o2.id, u2, 'Paciente Dois') returning id into p2;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o1.id, p1, u1, '2026-03-10 13:00Z', '2026-03-10 14:00Z', u1) returning id into ap;
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, user_created)
    values (o2.id, p2, u2, '2026-03-10 13:00Z', '2026-03-10 14:00Z', u2) returning id into ap2;
  select id into cin from financial_categories where organization_id is null and kind = 'income' and name = 'Consulta';
  select id into cex from financial_categories where organization_id is null and kind = 'expense' and name = 'Aluguel';
  assert cin is not null and cex is not null, 'categorias padrão';

  -- Categorias do consultório
  insert into financial_categories (organization_id, kind, name, user_created) values (o1.id, 'income', ' Avaliação corporal ', u1) returning id into cown;
  assert (select name = 'Avaliação corporal' from financial_categories where id = cown), 'nome aparado';
  ok := false; begin insert into financial_categories (organization_id, kind, name, user_created) values (o1.id, 'income', 'Do assistente', ua);
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista%'; end; assert ok, 'assistente não cria categoria';
  ok := false; begin insert into financial_categories (organization_id, kind, name, user_created) values (null, 'income', 'Forjada', u1);
  exception when others then ok := sqlerrm like '%equipe da Rafanutri%'; end; assert ok, 'ninguém cria categoria padrão';

  -- Três recebimentos pagos em março: o fluxo bate com a soma em centavos
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, patient_id, appointment_id, user_created)
    values (o1.id, 'income', cin, 'Consulta março', 25000, '2026-03-10', 'paid', '2026-03-10', p1, ap, u1) returning id into t1;
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, user_created)
    values (o1.id, 'income', cown, 'Avaliação', 12050, '2026-03-12', 'paid', '2026-03-12', ua),
           (o1.id, 'income', cin, 'Retorno', 18001, '2026-03-20', 'paid', '2026-03-31', u1),
           (o1.id, 'expense', cex, 'Aluguel março', 150000, '2026-03-05', 'paid', '2026-03-05', u1);
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created)
    values (o1.id, 'income', cin, 'Em aberto', 9999, '2026-03-25', u1) returning id into t2;
  assert (select income_cents = 55051 and expense_cents = 150000 and balance_cents = -94949
          from monthly_cash_flow where organization_id = o1.id and month = '2026-03-01'), 'fluxo de março em centavos';
  assert not exists (select 1 from monthly_cash_flow where organization_id = o2.id), 'outro consultório sem fluxo';

  -- Regras de consistência
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created) values (o1.id, 'income', cin, 'Zero', 0, '2026-03-01', u1);
  exception when check_violation then ok := true; end; assert ok, 'valor > 0';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, user_created) values (o1.id, 'income', cin, 'Pago sem data', 100, '2026-03-01', 'paid', u1);
  exception when check_violation then ok := true; end; assert ok, 'pago exige data';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created) values (o1.id, 'income', cex, 'Categoria errada', 100, '2026-03-01', u1);
  exception when others then ok := sqlerrm like '%Categoria inválida%'; end; assert ok, 'categoria de despesa em receita';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created) values (o2.id, 'income', cown, 'Categoria de A', 100, '2026-03-01', u2);
  exception when others then ok := sqlerrm like '%Categoria inválida%'; end; assert ok, 'categoria de outro consultório';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, patient_id, user_created) values (o1.id, 'income', cin, 'Paciente B', 100, '2026-03-01', p2, u1);
  exception when others then ok := sqlerrm like '%Paciente de outro consultório%'; end; assert ok, 'paciente de outro consultório';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, appointment_id, user_created) values (o1.id, 'income', cin, 'Consulta B', 100, '2026-03-01', ap2, u1);
  exception when others then ok := sqlerrm like '%Consulta de outro%'; end; assert ok, 'consulta de outro consultório';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, appointment_id, user_created) values (o1.id, 'income', cin, 'Duplicado', 100, '2026-03-01', ap, u1);
  exception when unique_violation then ok := true; end; assert ok, 'um recebimento por consulta';
  ok := false; begin insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created) values (o1.id, 'income', cin, 'Intruso', 100, '2026-03-01', u2);
  exception when others then ok := sqlerrm like '%Só membros%'; end; assert ok, 'quem não é membro não lança';
  ok := false; begin update financial_transactions set user_created = ua where id = t1;
  exception when others then ok := sqlerrm like '%não muda%'; end; assert ok, 'autor não muda';

  -- Cancelar libera a consulta para outro recebimento
  update financial_transactions set status = 'cancelled', paid_at = null where id = t1;
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, appointment_id, user_created) values (o1.id, 'income', cin, 'Novo', 100, '2026-03-01', ap, u1);

  -- Excluir: sem ator ninguém; assistente não; nutricionista/owner sim
  ok := false; begin delete from financial_transactions where id = t2;
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista exclui%'; end; assert ok, 'sem ator não exclui';
  perform set_config('rafanutri.actor', ua::text, true);
  ok := false; begin delete from financial_transactions where id = t2;
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista exclui%'; end; assert ok, 'assistente não exclui';
  perform set_config('rafanutri.actor', u2::text, true);
  ok := false; begin delete from financial_transactions where id = t2;
  exception when others then ok := sqlerrm like '%Só owner ou nutricionista exclui%'; end; assert ok, 'owner de outro consultório não exclui';
  perform set_config('rafanutri.actor', u1::text, true);
  delete from financial_transactions where id = t2;
  assert not exists (select 1 from financial_transactions where id = t2), 'owner exclui';
  perform set_config('rafanutri.actor', '', true);

  -- Apagar o consultório leva os lançamentos (cascata, sem ator) — corrigido na 0025
  if exists (select 1 from schema_migrations where version = '0025_receipts') then
    delete from organizations where id = o1.id;
    assert not exists (select 1 from financial_transactions where organization_id = o1.id), 'cascata do consultório';
  end if;

  raise notice '0024_finance: todos os testes passaram';
end $$;

rollback;
