-- RN-214 — Métricas do plano gratuito: eventos de produto e views internas. Idempotente.
-- Os eventos são gravados por gatilhos (não dependem do app). "Limite atingido" é gravado pelo hook
-- da extensão antes de recusar o cadastro, porque um gatilho seria desfeito junto com o insert que falha.
-- product_events e as views metrics_* não têm permissão para nenhum papel do Directus: só leitura
-- interna (psql / scripts/metrics.sh). Não guardam nome, e-mail nem dado clínico.

begin;

create table if not exists product_events (
  id              bigint generated always as identity primary key,
  event           text not null check (event in (
                    'patient_created', 'limit_reached', 'paid_interest', 'invite_sent',
                    'patient_activated', 'recommendation_read')),
  organization_id uuid references organizations (id) on delete cascade,
  user_id         uuid,
  patient_id      uuid,
  data            jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at      timestamptz not null default now()
);

create index if not exists product_events_event_time on product_events (event, created_at desc);
create index if not exists product_events_org on product_events (organization_id, event);

-- Gatilhos que registram os eventos
create or replace function product_events_patients() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into product_events (event, organization_id, user_id, patient_id) values ('patient_created', new.organization_id, new.responsible_user_id, new.id);
  elsif new.app_activated_at is not null and new.app_activated_at is distinct from old.app_activated_at then
    insert into product_events (event, organization_id, user_id, patient_id) values ('patient_activated', new.organization_id, new.app_user_id, new.id);
  end if;
  return null;
end $$;
drop trigger if exists product_events_patients on patients;
create trigger product_events_patients after insert or update of app_activated_at on patients
  for each row execute function product_events_patients();

create or replace function product_events_invites() returns trigger language plpgsql as $$
begin
  insert into product_events (event, organization_id, user_id, patient_id) values ('invite_sent', new.organization_id, new.user_created, new.patient_id);
  return null;
end $$;
drop trigger if exists product_events_invites on patient_app_invites;
create trigger product_events_invites after insert on patient_app_invites
  for each row execute function product_events_invites();

create or replace function product_events_waitlist() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.desired_plan is distinct from old.desired_plan then
    insert into product_events (event, organization_id, user_id, data)
    values ('paid_interest', new.organization_id, new.user_id, jsonb_build_object('desired_plan', new.desired_plan, 'active_patients', new.active_patients));
  end if;
  return null;
end $$;
drop trigger if exists product_events_waitlist on plan_waitlist;
create trigger product_events_waitlist after insert or update on plan_waitlist
  for each row execute function product_events_waitlist();

create or replace function product_events_recommendations() returns trigger language plpgsql as $$
begin
  if old.read_at is null and new.read_at is not null then
    insert into product_events (event, organization_id, patient_id) values ('recommendation_read', new.organization_id, new.patient_id);
  end if;
  return null;
end $$;
drop trigger if exists product_events_recommendations on patient_recommendations;
create trigger product_events_recommendations after update of read_at on patient_recommendations
  for each row execute function product_events_recommendations();

-- Views do painel interno
create or replace view metrics_free_orgs as
select o.id as organization_id, o.created_at,
       (select count(*) from patients p where p.organization_id = o.id and p.status = 'active') as active_patients,
       pl.max_active_patients as patient_limit,
       (select count(*) from patients p where p.organization_id = o.id and p.app_user_id is not null and p.status = 'active') as patients_with_access,
       (select count(*) from product_events e where e.organization_id = o.id and e.event = 'limit_reached' and e.created_at > now() - interval '30 days') as limit_hits_30d,
       exists (select 1 from plan_waitlist w where w.organization_id = o.id) as wants_paid_plan
from organizations o join plans pl on pl.code = o.plan
where o.plan = 'free';

create or replace view metrics_active_patients_distribution as
select case
         when active_patients >= patient_limit then 'no limite'
         when active_patients >= patient_limit - 2 then 'a 1–2 do limite'
         when active_patients >= 15 then '15 ou mais'
         when active_patients >= 5 then '5 a 14'
         when active_patients >= 1 then '1 a 4'
         else 'nenhum'
       end as faixa,
       count(*) as organizacoes
from metrics_free_orgs group by 1;

create or replace view metrics_activation as
select count(*) filter (where event = 'invite_sent') as convites,
       count(distinct patient_id) filter (where event = 'invite_sent') as pacientes_convidados,
       count(distinct patient_id) filter (where event = 'patient_activated') as pacientes_ativados,
       round(100.0 * count(distinct patient_id) filter (where event = 'patient_activated')
             / nullif(count(distinct patient_id) filter (where event = 'invite_sent'), 0), 1) as taxa_ativacao_pct,
       count(*) filter (where event = 'recommendation_read') as recomendacoes_lidas
from product_events;

create or replace view metrics_limit_hits_monthly as
select date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
       count(distinct organization_id) as organizacoes_no_limite,
       count(*) as tentativas_bloqueadas
from product_events where event = 'limit_reached' group by 1;

create or replace view metrics_waitlist as
select w.desired_plan, count(*) as interessados, round(avg(w.active_patients), 1) as media_pacientes_ativos,
       min(w.date_created) as primeiro, max(coalesce(w.date_updated, w.date_created)) as ultimo
from plan_waitlist w group by w.desired_plan;

-- Preenchimento retroativo (só na primeira vez, com a tabela vazia)
do $$ begin
  if not exists (select 1 from product_events) then
    insert into product_events (event, organization_id, user_id, patient_id, created_at)
      select 'patient_created', organization_id, responsible_user_id, id, created_at from patients;
    insert into product_events (event, organization_id, user_id, patient_id, created_at)
      select 'patient_activated', organization_id, app_user_id, id, app_activated_at from patients where app_activated_at is not null;
    insert into product_events (event, organization_id, user_id, patient_id, created_at)
      select 'invite_sent', organization_id, user_created, patient_id, date_created from patient_app_invites;
    insert into product_events (event, organization_id, user_id, data, created_at)
      select 'paid_interest', organization_id, user_id, jsonb_build_object('desired_plan', desired_plan, 'active_patients', active_patients), date_created from plan_waitlist;
    insert into product_events (event, organization_id, patient_id, created_at)
      select 'recommendation_read', organization_id, patient_id, read_at from patient_recommendations where read_at is not null;
  end if;
end $$;

insert into schema_migrations (version) values ('0022_product_events') on conflict do nothing;

commit;
