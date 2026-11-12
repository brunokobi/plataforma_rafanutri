-- Segurança: modelos "da plataforma" (organization_id nulo) ficam visíveis para todos os
-- consultórios. Só podem ser criados direto no banco (seeds), nunca por um usuário pela API.
-- Achado do teste de isolamento em 12/11/2026: a validação `_nnull` da permissão do Directus não
-- é aplicada quando o campo nem vem no corpo, e um usuário criou um modelo de plano sem
-- consultório. Idempotente.

begin;

create or replace function library_templates_guard() returns trigger language plpgsql as $$
begin
  -- user_created é preenchido pelo Directus em toda criação pela API; seeds em SQL não o preenchem.
  if new.organization_id is null and new.user_created is not null then
    raise exception 'Modelos sem consultório (biblioteca da plataforma) só podem ser criados pela equipe da Rafanutri' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists questionnaire_templates_library_guard on questionnaire_templates;
create trigger questionnaire_templates_library_guard before insert on questionnaire_templates
  for each row execute function library_templates_guard();

drop trigger if exists meal_plan_templates_library_guard on meal_plan_templates;
create trigger meal_plan_templates_library_guard before insert on meal_plan_templates
  for each row execute function library_templates_guard();

-- Remove o modelo criado pelo teste de isolamento antes da correção.
delete from meal_plan_templates where id = '45011670-afcd-4a6c-9ca2-5376e04015a7' and name = 'Biblioteca falsa';

insert into schema_migrations (version) values ('0011_library_templates_guard') on conflict do nothing;

commit;
