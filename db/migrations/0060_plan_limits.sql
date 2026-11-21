-- Diferença entre Essencial e Profissional: o Essencial vai até 100 pacientes ativos; o Profissional não tem limite
-- (e recebe IA sem limite e o módulo materno-infantil quando saírem). Quem já passa de 100 mantém os pacientes;
-- o gatilho enforce_active_patient_limit (0004) só barra novos ativos. Espelha apps/web/lib/modules/plans.ts.

begin;

update plans set max_active_patients = 100 where code = 'essential';

insert into schema_migrations (version) values ('0060_plan_limits') on conflict do nothing;

commit;
