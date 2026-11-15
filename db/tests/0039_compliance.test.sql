-- Testes da migração 0039 (índice de conformidade). Transação desfeita no fim.
--   psql -v ON_ERROR_STOP=1 -f db/tests/0039_compliance.test.sql

begin;

do $$
declare
  owner uuid := gen_random_uuid();
  o1 organizations;
  ua uuid; ub uuid; tpl uuid; run uuid; eq uuid; c jsonb; sc numeric;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into directus_users (id, email) values (owner, 'cp-owner@example.com');
  o1 := create_organization(owner, 'Cozinha Índice', 'company', null, '1', 'CRN-2');
  update organizations set modules = '{clinical,uan}' where id = o1.id;
  insert into organization_contracts (organization_id, plan, units_contracted) values (o1.id, 'uan_pilot', 2);
  insert into production_units (organization_id, name) values (o1.id, 'Unidade A') returning id into ua;
  insert into production_units (organization_id, name) values (o1.id, 'Unidade B') returning id into ub;
  select id into tpl from checklist_templates where code = 'higiene-manipuladores' and organization_id is null;

  -- unidade sem nada: sem índice
  c := uan_compliance(ub);
  assert c ->> 'index' is null and c -> 'components' = '{}'::jsonb, 'sem dados, sem índice';

  -- agenda diária criada há 3 dias: 3 ocorrências passadas (hoje não conta)
  insert into checklist_schedules (unit_id, template_id, weekdays, at_time, created_at)
    values (ua, tpl, '{1,2,3,4,5,6,7}', '07:00', ((today - 3)::timestamp + time '06:00') at time zone 'America/Sao_Paulo');
  -- um checklist concluído anteontem (todos conformes) e um hoje (fora da agenda passada)
  run := checklist_start(ua, tpl, owner, gen_random_uuid());
  update checklist_answers set value = 'conform' where run_id = run;
  update checklist_answers set value = 'non_conform' where run_id = run and position = 2;
  perform checklist_complete(run, owner);
  alter table checklist_runs disable trigger checklist_runs_guard;
  update checklist_runs set started_at = ((today - 2)::timestamp + time '07:30') at time zone 'America/Sao_Paulo',
                            completed_at = ((today - 2)::timestamp + time '07:40') at time zone 'America/Sao_Paulo' where id = run;
  alter table checklist_runs enable trigger checklist_runs_guard;
  select score into sc from checklist_runs where id = run;

  -- 3 leituras, 1 fora do limite
  insert into equipment (unit_id, name, kind) values (ua, 'Geladeira', 'refrigerator') returning id into eq;
  insert into temperature_readings (unit_id, equipment_id, value, client_id) values (ua, eq, 3, gen_random_uuid()), (ua, eq, 4, gen_random_uuid());
  insert into temperature_readings (unit_id, equipment_id, value, corrective_action, client_id) values (ua, eq, 8, 'Ajustado', gen_random_uuid());

  -- 1 NC aberta com prazo vencido
  insert into non_conformities (unit_id, source, title, severity) values (ua, 'manual', 'Ralo entupido', 'low');
  update non_conformities set due_at = now() - interval '1 hour' where unit_id = ua;

  c := uan_compliance(ua);
  assert (c -> 'counts' ->> 'scheduled')::int = 3 and (c -> 'counts' ->> 'scheduled_done')::int = 1, format('agenda 1/3: %s', c -> 'counts');
  assert (c -> 'components' ->> 'schedule')::numeric = 33.3, 'componente agenda';
  assert (c -> 'components' ->> 'score')::numeric = round(sc, 1), 'componente pontuação';
  assert (c -> 'components' ->> 'temperature')::numeric = 66.7, 'componente temperatura';
  assert (c -> 'components' ->> 'deadlines')::numeric = 80, 'componente prazos';
  assert (c ->> 'index')::numeric = round((30 * 33.3 + 30 * round(sc, 1) + 20 * 66.7 + 20 * 80) / 100, 1)
         or abs((c ->> 'index')::numeric - (30 * 100.0 / 3 + 30 * sc + 20 * 200.0 / 3 + 20 * 80) / 100) < 0.2, format('índice %s', c ->> 'index');
  assert (c -> 'counts' ->> 'nc_overdue')::int = 1 and (c -> 'counts' ->> 'checklists_overdue_today')::int in (0, 1), 'contagens';

  -- pesos configuráveis: só temperatura
  c := uan_compliance(ua, 30, '{"temperature":1}');
  assert (c ->> 'index')::numeric = 66.7, 'pesos trocados';

  -- janela: 1 dia não pega o checklist de anteontem
  c := uan_compliance(ua, 1);
  assert c -> 'components' ->> 'score' is null, 'fora da janela';
end $$;

rollback;
