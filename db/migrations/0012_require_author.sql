-- Segurança (revisão de 12/11/2026): os gatilhos de avaliações, planos, agenda, anamneses e modelos
-- só conferiam se o autor é owner/nutricionista do consultório QUANDO user_created vinha preenchido.
-- Como essas coleções são criadas sem filtro de permissão (o gatilho é a proteção), um user_created
-- vazio pulava a checagem — o que aconteceu com as avaliações enquanto o campo ainda não tinha o
-- preenchimento automático do Directus. Agora o autor é obrigatório na criação.
-- Também: o profissional deixa de poder gravar `reviewed_by` arbitrário na anamnese. Idempotente.

begin;

-- Coleções criadas só pela API (por um usuário): autor obrigatório.
create or replace function require_author() returns trigger language plpgsql as $$
begin
  if new.user_created is null then
    raise exception 'Registro sem autor: crie pela aplicação, com login' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['anthropometric_assessments', 'meal_plans', 'appointments', 'anamneses'] loop
    execute format('drop trigger if exists %1$s_require_author on %1$I', t);
    execute format('create trigger %1$s_require_author before insert on %1$I for each row execute function require_author()', t);
  end loop;
end $$;

-- Modelos: os da plataforma (sem consultório) vêm de seed sem autor; os de consultório exigem autor.
create or replace function require_author_for_org_template() returns trigger language plpgsql as $$
begin
  if new.organization_id is not null and new.user_created is null then
    raise exception 'Modelo de consultório sem autor: crie pela aplicação, com login' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists questionnaire_templates_require_author on questionnaire_templates;
create trigger questionnaire_templates_require_author before insert on questionnaire_templates
  for each row execute function require_author_for_org_template();
drop trigger if exists meal_plan_templates_require_author on meal_plan_templates;
create trigger meal_plan_templates_require_author before insert on meal_plan_templates
  for each row execute function require_author_for_org_template();

-- Anamnese: reviewed_by só muda junto com a passagem para "revisada".
create or replace function anamneses_reviewed_by_guard() returns trigger language plpgsql as $$
begin
  if new.reviewed_by is distinct from old.reviewed_by and not (old.status = 'answered' and new.status = 'reviewed') then
    raise exception 'Revisor só é registrado ao marcar a anamnese como revisada' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists anamneses_reviewed_by_guard on anamneses;
create trigger anamneses_reviewed_by_guard before update on anamneses
  for each row execute function anamneses_reviewed_by_guard();

insert into schema_migrations (version) values ('0012_require_author') on conflict do nothing;

commit;
