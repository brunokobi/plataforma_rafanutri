-- RN-148 — Assinatura de quem fez o checklist (PNG desenhado no aparelho). Idempotente.
-- Opcional; só pode ser gravada com o checklist em andamento (depois de concluído, fica como está:
-- o gatilho checklist_runs_guard já recusa qualquer mudança em execução fechada).

begin;

alter table checklist_runs add column if not exists signature uuid references directus_files (id) on delete set null;
alter table checklist_runs add column if not exists signed_by uuid references directus_users (id) on delete set null;

insert into schema_migrations (version) values ('0040_checklist_signature') on conflict do nothing;

commit;
