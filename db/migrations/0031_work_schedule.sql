-- RN-022 — Expediente do consultório para a agenda. Idempotente.
-- A sugestão de horários livres da agenda usa início, fim e dias da semana daqui (padrão: 08h–18h, todos
-- os dias, igual ao comportamento anterior). A página pública (0029) mantém o próprio horário de atendimento online.
-- Gravado só pelo endpoint PUT /rafanutri/practices/:id/schedule (owner).

begin;

alter table organizations add column if not exists work_start time not null default '08:00';
alter table organizations add column if not exists work_end time not null default '18:00';
alter table organizations add column if not exists work_weekdays integer[] not null default '{1,2,3,4,5,6,7}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_work_hours_check') then
    alter table organizations add constraint organizations_work_hours_check check (work_end > work_start);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_work_weekdays_check') then
    alter table organizations add constraint organizations_work_weekdays_check
      check (work_weekdays <@ '{1,2,3,4,5,6,7}' and cardinality(work_weekdays) between 1 and 7);
  end if;
end $$;

insert into schema_migrations (version) values ('0031_work_schedule') on conflict do nothing;

commit;
