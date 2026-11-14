-- Testes da migração 0028 (indicadores do painel) com dados conhecidos. Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0028_dashboard.test.sql

begin;

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  o1 organizations;
  p1 uuid; p2 uuid; p3 uuid; a1 uuid; a2 uuid; cin uuid; cex uuid; j jsonb; m date := date '2026-03-15';
begin
  insert into directus_users (id, email) values (u1, 'dash-a@example.com'), (u2, 'dash-b@example.com');
  o1 := create_organization(u1, 'Consultório Painel', 'clinic', null, '1', 'CRN-1');
  insert into plans (code, name, max_active_patients, max_members, price_cents) values ('teste-dash', 'Teste', 100, 5, 0);
  update organizations set plan = 'teste-dash' where id = o1.id;
  insert into organization_members (organization_id, user_id, role) values (o1.id, u2, 'nutritionist');
  insert into patients (organization_id, responsible_user_id, full_name, created_at) values (o1.id, u1, 'Paciente Um', '2026-03-02 12:00Z') returning id into p1;
  insert into patients (organization_id, responsible_user_id, full_name, created_at) values (o1.id, u1, 'Paciente Dois', '2026-03-20 12:00Z') returning id into p2;
  insert into patients (organization_id, responsible_user_id, full_name, created_at) values (o1.id, u1, 'Paciente Três', '2026-02-10 12:00Z') returning id into p3;
  select id into cin from financial_categories where organization_id is null and kind = 'income' and name = 'Consulta';
  select id into cex from financial_categories where organization_id is null and kind = 'expense' and name = 'Aluguel';

  -- Março: 3 concluídas (2 de u1, 1 de u2), 1 falta (u1), 1 cancelada; fevereiro: 1 concluída
  insert into appointments (organization_id, patient_id, nutritionist_id, starts_at, ends_at, type, status, user_created) values
    (o1.id, p1, u1, '2026-03-05 13:00Z', '2026-03-05 14:00Z', 'first', 'completed', u1),
    (o1.id, p2, u1, '2026-03-21 13:00Z', '2026-03-21 14:00Z', 'first', 'completed', u1),
    (o1.id, p3, u2, '2026-03-10 13:00Z', '2026-03-10 14:00Z', 'return', 'completed', u2),
    (o1.id, p1, u1, '2026-03-25 13:00Z', '2026-03-25 14:00Z', 'return', 'no_show', u1),
    (o1.id, p2, u1, '2026-03-28 13:00Z', '2026-03-28 14:00Z', 'return', 'cancelled', u1),
    (o1.id, p3, u2, '2026-02-10 13:00Z', '2026-02-10 14:00Z', 'first', 'completed', u2);
  select id into a1 from appointments where patient_id = p1 and status = 'completed';
  select id into a2 from appointments where patient_id = p3 and status = 'completed' and starts_at = '2026-03-10 13:00Z';

  -- Março: recebidos 250,00 (consulta a1) + 300,00 (consulta a2, de u2) + 100,00 (sem paciente); despesa não conta; aberto 99,99 vencido
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, patient_id, appointment_id, user_created) values
    (o1.id, 'income', cin, 'Consulta p1', 25000, '2026-03-05', 'paid', '2026-03-05', p1, a1, u1),
    (o1.id, 'income', cin, 'Consulta p3', 30000, '2026-03-10', 'paid', '2026-03-10', p3, a2, u1);
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, status, paid_at, user_created) values
    (o1.id, 'income', cin, 'Avulso', 10000, '2026-03-12', 'paid', '2026-03-12', u1),
    (o1.id, 'expense', cex, 'Aluguel', 150000, '2026-03-01', 'paid', '2026-03-01', u1);
  insert into financial_transactions (organization_id, kind, category_id, description, amount_cents, due_date, user_created) values
    (o1.id, 'income', cin, 'Em aberto', 9999, '2026-03-01', u1);

  j := dashboard_indicators(o1.id, m);
  assert (j -> 'current' ->> 'month') = '2026-03-01', 'mês';
  assert (j -> 'current' ->> 'revenue_cents')::bigint = 65000, 'faturamento ' || (j -> 'current' ->> 'revenue_cents');
  assert (j -> 'current' ->> 'avg_ticket_cents')::bigint = 27500, 'ticket médio ' || (j -> 'current' ->> 'avg_ticket_cents');
  assert (j -> 'current' ->> 'visits')::int = 3, 'consultas';
  assert (j -> 'current' ->> 'no_shows')::int = 1, 'faltas';
  assert (j -> 'current' ->> 'no_show_rate')::numeric = 25.0, 'taxa de faltas ' || (j -> 'current' ->> 'no_show_rate');
  assert (j -> 'current' ->> 'new_patients')::int = 2, 'novos pacientes';
  assert (j -> 'previous' ->> 'visits')::int = 1 and (j -> 'previous' ->> 'new_patients')::int = 1, 'mês anterior';
  assert (j ->> 'receivable_cents')::bigint = 9999 and (j ->> 'overdue_cents')::bigint = 9999, 'a receber e vencido';
  -- Retornos atrasados: p1 (última 05/03 + 30 < hoje), p3 (10/03 + 30), p2 (21/03 + 30) — todas antes de hoje (2026-11)
  assert (j ->> 'overdue_returns')::int = 3, 'retornos atrasados ' || (j ->> 'overdue_returns');

  -- Filtro por nutricionista
  j := dashboard_indicators(o1.id, m, u2);
  assert (j -> 'current' ->> 'visits')::int = 1 and (j -> 'current' ->> 'no_shows')::int = 0, 'consultas de u2';
  assert (j -> 'current' ->> 'avg_ticket_cents')::bigint = 30000, 'ticket de u2';
  assert (j ->> 'overdue_returns')::int = 1, 'retornos de u2';
  j := dashboard_indicators(o1.id, m, u1);
  assert (j -> 'current' ->> 'no_show_rate')::numeric = 33.3, 'faltas de u1 ' || (j -> 'current' ->> 'no_show_rate');

  -- Mês vazio
  j := dashboard_indicators(o1.id, date '2025-01-10');
  assert (j -> 'current' ->> 'revenue_cents')::bigint = 0 and (j -> 'current' ->> 'no_show_rate')::numeric = 0, 'mês sem dados';

  raise notice '0028_dashboard: todos os testes passaram';
end $$;

rollback;
