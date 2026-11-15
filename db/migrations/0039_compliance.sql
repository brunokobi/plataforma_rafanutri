-- RN-165 — Painel de conformidade: índice por unidade. Idempotente.
--
-- Decisões:
-- - Calculado na consulta (não materializado): no volume do piloto é barato e evita job de atualização.
--   Se o volume crescer, a mesma função alimenta uma visão materializada.
-- - Índice (0 a 100) dos últimos N dias (padrão 30) = média ponderada dos componentes com dados:
--     agenda       30  checklists agendados feitos no dia (dias anteriores a hoje, desde a criação da agenda)
--     pontuação    30  média da pontuação dos checklists concluídos
--     temperatura  20  leituras dentro do limite
--     prazos       20  100 − 20 por não conformidade aberta com prazo vencido (mínimo 0)
--   Componente sem dados (ex.: unidade sem agenda) fica de fora e os pesos se redistribuem.
--   Os pesos podem ser trocados pelo parâmetro p_weights.

begin;

create or replace function uan_compliance(p_unit uuid, p_days integer default 30,
                                          p_weights jsonb default '{"schedule":30,"score":30,"temperature":20,"deadlines":20}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := local_today - (greatest(1, least(p_days, 365)) - 1);
  sched_total integer; sched_done integer;
  score_avg numeric; runs_done integer;
  temp_total integer; temp_in integer;
  nc_open integer; nc_overdue integer; nc_critical integer;
  eq_overdue integer; today_overdue integer;
  comp jsonb := '{}'::jsonb; wsum numeric := 0; isum numeric := 0; k text; v numeric; w numeric;
begin
  -- agenda: ocorrências de dias passados (desde a criação da agenda) e quantas tiveram checklist concluído no dia
  select count(*), count(*) filter (where exists (
           select 1 from checklist_runs r
            where r.unit_id = s.unit_id and r.template_id = s.template_id and r.status = 'completed'
              and (r.started_at at time zone 'America/Sao_Paulo')::date = d.day::date))
    into sched_total, sched_done
    from checklist_schedules s
    join checklist_templates t on t.id = s.template_id and t.active
    cross join lateral generate_series(greatest(since, (s.created_at at time zone 'America/Sao_Paulo')::date), local_today - 1, interval '1 day') as d(day)
   where s.unit_id = p_unit and s.active and extract(isodow from d.day::date)::smallint = any (s.weekdays);

  select avg(score), count(*) into score_avg, runs_done
    from checklist_runs where unit_id = p_unit and status = 'completed' and score is not null
     and (completed_at at time zone 'America/Sao_Paulo')::date >= since;

  select count(*), count(*) filter (where not out_of_range) into temp_total, temp_in
    from temperature_readings where unit_id = p_unit and (recorded_at at time zone 'America/Sao_Paulo')::date >= since;

  select count(*) filter (where status in ('open', 'in_progress')),
         count(*) filter (where status in ('open', 'in_progress') and due_at < now()),
         count(*) filter (where status in ('open', 'in_progress') and severity = 'critical')
    into nc_open, nc_overdue, nc_critical
    from non_conformities where unit_id = p_unit;

  select count(*) into eq_overdue from equipment e
   where e.unit_id = p_unit and e.active and coalesce(
     (select max(recorded_at) from temperature_readings r where r.equipment_id = e.id), '-infinity'::timestamptz)
     < now() - make_interval(hours => e.reading_interval_hours);

  select count(*) into today_overdue from checklist_day(p_unit) where status = 'overdue';

  if sched_total > 0 then comp := comp || jsonb_build_object('schedule', round(100.0 * sched_done / sched_total, 1)); end if;
  if runs_done > 0 then comp := comp || jsonb_build_object('score', round(score_avg, 1)); end if;
  if temp_total > 0 then comp := comp || jsonb_build_object('temperature', round(100.0 * temp_in / temp_total, 1)); end if;
  if runs_done > 0 or temp_total > 0 or nc_open > 0 then comp := comp || jsonb_build_object('deadlines', greatest(0, 100 - 20 * nc_overdue)); end if;

  for k, v in select key, value::numeric from jsonb_each_text(comp) loop
    w := coalesce((p_weights ->> k)::numeric, 0);
    wsum := wsum + w; isum := isum + w * v;
  end loop;

  return jsonb_build_object(
    'days', greatest(1, least(p_days, 365)),
    'index', case when wsum > 0 then round(isum / wsum, 1) end,
    'components', comp,
    'weights', p_weights,
    'counts', jsonb_build_object(
      'scheduled', sched_total, 'scheduled_done', sched_done, 'runs_completed', runs_done,
      'readings', temp_total, 'readings_in_range', temp_in,
      'nc_open', nc_open, 'nc_overdue', nc_overdue, 'nc_critical_open', nc_critical,
      'equipment_overdue', eq_overdue, 'checklists_overdue_today', today_overdue));
end $$;

insert into schema_migrations (version) values ('0039_compliance') on conflict do nothing;

commit;
