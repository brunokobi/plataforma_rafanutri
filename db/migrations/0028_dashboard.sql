-- RN-064 — Indicadores do consultório para o painel inicial. Idempotente.
-- Uma função agregada (lida só pelo endpoint da extensão, que confere o consultório do usuário):
--   dashboard_indicators(org, mês, nutricionista opcional) → json com o mês pedido e o anterior.
-- Definições (mês no horário de Brasília):
--   revenue_cents      receitas pagas no mês (regime de caixa);
--   receivable_cents   receitas em aberto (todas as datas) e overdue_cents as vencidas antes de hoje;
--   avg_ticket_cents   média das receitas pagas no mês ligadas a consulta ou paciente (0 se nenhuma);
--   visits             consultas concluídas no mês; no_shows faltas no mês;
--   no_show_rate       faltas / (concluídas + faltas), em % com 1 casa;
--   new_patients       pacientes cadastrados no mês;
--   overdue_returns    pacientes ativos sem consulta marcada com retorno previsto (última + intervalo) antes de hoje.
-- Com nutricionista: consultas, faltas, ticket (pelas consultas dele) e retornos (pacientes cuja última consulta foi com ele).

begin;

create or replace function dashboard_month(org uuid, m date, nutri uuid) returns jsonb language sql stable as $$
  with bounds as (
    select (date_trunc('month', m)::date) as d0, (date_trunc('month', m) + interval '1 month')::date as d1
  ),
  appts as (
    select a.* from appointments a, bounds b
     where a.organization_id = org and (nutri is null or a.nutritionist_id = nutri)
       and (a.starts_at at time zone 'America/Sao_Paulo')::date >= b.d0 and (a.starts_at at time zone 'America/Sao_Paulo')::date < b.d1
  ),
  paid as (
    select t.* from financial_transactions t, bounds b
     where t.organization_id = org and t.kind = 'income' and t.status = 'paid' and t.paid_at >= b.d0 and t.paid_at < b.d1
  ),
  ticket as (
    select t.amount_cents from paid t
     where (t.appointment_id is not null or t.patient_id is not null)
       and (nutri is null or exists (select 1 from appointments a where a.id = t.appointment_id and a.nutritionist_id = nutri))
  )
  select jsonb_build_object(
    'month', (select d0 from bounds)::text,
    'revenue_cents', coalesce((select sum(amount_cents) from paid), 0)::bigint,
    'avg_ticket_cents', coalesce((select round(avg(amount_cents)) from ticket), 0)::bigint,
    'paid_count', (select count(*) from ticket),
    'visits', (select count(*) from appts where status = 'completed'),
    'no_shows', (select count(*) from appts where status = 'no_show'),
    'no_show_rate', coalesce((select round(100.0 * count(*) filter (where status = 'no_show') / nullif(count(*) filter (where status in ('completed', 'no_show')), 0), 1) from appts), 0),
    'new_patients', (select count(*) from patients p, bounds b where p.organization_id = org
                       and (p.created_at at time zone 'America/Sao_Paulo')::date >= b.d0 and (p.created_at at time zone 'America/Sao_Paulo')::date < b.d1)
  )
$$;

create or replace function dashboard_indicators(org uuid, m date default null, nutri uuid default null) returns jsonb language sql stable as $$
  with today as (select (now() at time zone 'America/Sao_Paulo')::date as d),
  cur as (select coalesce(m, (select d from today)) as d)
  select jsonb_build_object(
    'current', dashboard_month(org, (select d from cur), nutri),
    'previous', dashboard_month(org, ((select d from cur) - interval '1 month')::date, nutri),
    'receivable_cents', coalesce((select sum(amount_cents) from financial_transactions where organization_id = org and kind = 'income' and status = 'open'), 0)::bigint,
    'overdue_cents', coalesce((select sum(amount_cents) from financial_transactions where organization_id = org and kind = 'income' and status = 'open' and due_date < (select d from today)), 0)::bigint,
    'overdue_returns', (
      select count(*) from (
        select p.id
          from patients p join appointments a on a.patient_id = p.id and a.status = 'completed'
         where p.organization_id = org and p.status = 'active'
           and not exists (select 1 from appointments x where x.patient_id = p.id and x.status in ('scheduled', 'confirmed') and x.starts_at > now())
         group by p.id, p.return_interval_days
        having (max(a.starts_at) at time zone 'America/Sao_Paulo')::date + p.return_interval_days < (select d from today)
           and (nutri is null or (array_agg(a.nutritionist_id order by a.starts_at desc))[1] = nutri)
      ) r)
  )
$$;

insert into schema_migrations (version) values ('0028_dashboard') on conflict do nothing;

commit;
