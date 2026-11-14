-- RN-210 — O que o paciente vê: calorias, macros e histórico de peso. Idempotente.
-- Regras no banco:
--   * organizations.patient_share_defaults: padrão do consultório (tudo desligado por padrão);
--   * patients.share_settings: escolha por paciente (nulo = segue o padrão do consultório);
--   * só as três chaves booleanas são aceitas;
--   * patient_share(patient) devolve o que vale (padrão + escolha do paciente);
--   * patient_weight_history(patient) devolve só data e peso, e nenhuma linha se o histórico não está liberado.

begin;

create or replace function share_settings_valid(s jsonb) returns boolean language sql immutable as $$
  select s is null or (
    jsonb_typeof(s) = 'object'
    and not exists (select 1 from jsonb_object_keys(s) k where k not in ('show_kcal', 'show_macros', 'show_weight_history'))
    and not exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) <> 'boolean')
  )
$$;

alter table organizations add column if not exists patient_share_defaults jsonb not null
  default '{"show_kcal": false, "show_macros": false, "show_weight_history": false}'::jsonb;
alter table patients add column if not exists share_settings jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_share_defaults_valid') then
    alter table organizations add constraint organizations_share_defaults_valid check (share_settings_valid(patient_share_defaults));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_share_settings_valid') then
    alter table patients add constraint patients_share_settings_valid check (share_settings_valid(share_settings));
  end if;
end $$;

create or replace function patient_share(p_patient uuid) returns jsonb language sql stable as $$
  select '{"show_kcal": false, "show_macros": false, "show_weight_history": false}'::jsonb
         || coalesce(o.patient_share_defaults, '{}'::jsonb)
         || coalesce(p.share_settings, '{}'::jsonb)
  from patients p join organizations o on o.id = p.organization_id
  where p.id = p_patient
$$;

create or replace function patient_weight_history(p_patient uuid)
returns table (assessed_at date, weight_kg numeric) language sql stable as $$
  select a.assessed_at, a.weight_kg
  from anthropometric_assessments a
  where a.patient_id = p_patient
    and a.weight_kg is not null
    and coalesce((patient_share(p_patient) ->> 'show_weight_history')::boolean, false)
  order by a.assessed_at
$$;

insert into schema_migrations (version) values ('0021_patient_share_settings') on conflict do nothing;

commit;
