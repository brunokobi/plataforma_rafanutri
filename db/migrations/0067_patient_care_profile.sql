-- Tipo de acompanhamento do paciente: clínico, esportivo ou materno-infantil. Nulo = automático (pela idade e pelo
-- objetivo). Define o visual da ficha e em quais páginas de módulo o paciente aparece. Idempotente.

begin;

alter table patients add column if not exists care_profile text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'patients_care_profile_check') then
    alter table patients add constraint patients_care_profile_check check (care_profile is null or care_profile in ('clinical', 'sport', 'maternal'));
  end if;
end $$;

-- Directus: owner e nutricionista criam e editam o campo (as permissões de patients listam os campos)
do $$ begin
  if to_regclass('directus_permissions') is not null then
    update directus_permissions set fields = fields || ',care_profile'
    where collection = 'patients' and action in ('create', 'update') and fields <> '*' and ',' || fields || ',' not like '%,care_profile,%';
  end if;
end $$;

insert into schema_migrations (version) values ('0067_patient_care_profile') on conflict do nothing;

commit;
