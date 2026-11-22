-- Higiene das regras de acesso no banco (sem mudar comportamento):
--   * is_clinical_member(org, user): "é owner ou nutricionista do consultório", antes repetido em 24 guardas;
--   * as funções-guarda vigentes são recriadas trocando a subconsulta pela função (definições tiradas do banco com
--     pg_get_functiondef, então valem exatamente as versões em uso; o tratamento de autor nulo de cada guarda não muda);
--   * financial_transactions_guard e leads_events passam a ler o ator pela audit_actor() (valida o UUID; antes um
--     valor inválido em rafanutri.actor fazia o cast ::uuid falhar). Idempotente.

begin;

create or replace function is_clinical_member(p_org uuid, p_user uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from organization_members
    where organization_id = p_org and user_id = p_user and role in ('owner', 'nutritionist')
  )
$$;

CREATE OR REPLACE FUNCTION public.anamneses_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare t questionnaire_templates;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'sent' then
      raise exception 'A anamnese nasce como enviada' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório envia anamneses' using errcode = 'P0001';
    end if;
    select * into t from questionnaire_templates where id = new.template_id;
    if not found or (t.organization_id is not null and t.organization_id <> new.organization_id) or not t.is_active then
      raise exception 'Modelo de questionário indisponível para este consultório' using errcode = 'P0001';
    end if;
    -- Cópia do questionário no envio (o cliente não manda o conteúdo).
    new.schema_snapshot := t.schema;
    new.template_version := t.version;
    new.title := coalesce(nullif(trim(new.title), ''), t.name);
    new.answers := '{}'::jsonb;
    new.answered_at := null; new.reviewed_at := null; new.reviewed_by := null;
    if new.public_token_hash is null then
      raise exception 'Anamnese enviada precisa de link' using errcode = 'P0001';
    end if;
    new.token_expires_at := least(coalesce(new.token_expires_at, now() + interval '7 days'), now() + interval '30 days');
    return new;
  end if;

  -- UPDATE
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.template_id is distinct from old.template_id or new.schema_snapshot is distinct from old.schema_snapshot
     or new.template_version is distinct from old.template_version then
    raise exception 'A anamnese não pode mudar de consultório, paciente ou questionário' using errcode = 'P0001';
  end if;
  if new.answers is distinct from old.answers and old.status <> 'sent' then
    raise exception 'Anamnese já respondida não pode ter as respostas alteradas' using errcode = 'P0001';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'sent' and new.status in ('answered', 'cancelled'))
         or (old.status = 'answered' and new.status = 'reviewed')) then
      raise exception 'Mudança de situação inválida: % → %', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'answered' then new.answered_at := now(); new.public_token_hash := null; end if;
    if new.status = 'cancelled' then new.public_token_hash := null; end if;
    if new.status = 'reviewed' then new.reviewed_at := now(); end if;
  end if;
  new.date_updated := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.anthropometric_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A avaliação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
    return new;
  end if;

  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
  end if;
  if new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
    raise exception 'Só owner ou nutricionista do consultório registra avaliações' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.appointments_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    -- Sem nutricionista informado: quem marca atende.
    if new.nutritionist_id is null then new.nutritionist_id := new.user_created; end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório marca consultas' using errcode = 'P0001';
    end if;
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A consulta não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    if old.status in ('completed', 'cancelled')
       and (new.starts_at <> old.starts_at or new.ends_at <> old.ends_at or new.nutritionist_id <> old.nutritionist_id) then
      raise exception 'Consulta concluída ou cancelada não pode ser remarcada' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  if new.nutritionist_id is null or not is_clinical_member(new.organization_id, new.nutritionist_id) then
    raise exception 'O nutricionista da consulta precisa ser do consultório' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.clinical_document_templates_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
  else
    if new.organization_id <> old.organization_id or new.kind <> old.kind then
      raise exception 'O modelo não muda de consultório nem de tipo' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.clinical_documents_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria documentos' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem documentos' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.kind <> old.kind
       or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
      raise exception 'O documento não muda de paciente, de tipo nem de autor' using errcode = 'P0001';
    end if;
    if new.status = 'published' and old.status = 'draft' then
      new.published_at := now();
    elsif new.status = 'draft' then
      new.published_at := null;
    else
      new.published_at := old.published_at;
    end if;
    new.date_updated := now();
  end if;
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.clinical_notes_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare prev clinical_notes; u record;
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null and pg_trigger_depth() = 1 then
      raise exception 'Evolução assinada não pode ser apagada; faça uma retificação' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório registra evoluções' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.appointment_id is not null and not exists (
      select 1 from appointments where id = new.appointment_id and patient_id = new.patient_id
    ) then
      raise exception 'A consulta não é deste paciente' using errcode = 'P0001';
    end if;
    if new.supersedes_id is not null then
      select * into prev from clinical_notes where id = new.supersedes_id;
      if not found or prev.patient_id <> new.patient_id or prev.organization_id <> new.organization_id then
        raise exception 'A evolução retificada não é deste paciente' using errcode = 'P0001';
      end if;
      if prev.signed_at is null then
        raise exception 'Só evoluções assinadas são retificadas; edite o rascunho' using errcode = 'P0001';
      end if;
    end if;
    new.signed_at := null; new.signer_name := null; new.signer_crn := null;
    new.date_created := now(); new.date_updated := null;
    new.body := trim(new.body);
    return new;
  end if;

  -- UPDATE (a consulta apagada zera appointment_id pela chave estrangeira: permitido mesmo assinada)
  if old.signed_at is not null then
    if pg_trigger_depth() > 1 and new.appointment_id is null
       and new.body = old.body and new.organization_id = old.organization_id and new.patient_id = old.patient_id
       and new.supersedes_id is not distinct from old.supersedes_id and new.user_created is not distinct from old.user_created
       and new.signed_at = old.signed_at and new.signer_name is not distinct from old.signer_name
       and new.signer_crn is not distinct from old.signer_crn and new.date_created = old.date_created
       and new.date_updated is not distinct from old.date_updated then
      return new;
    end if;
    raise exception 'Evolução assinada não pode ser alterada; faça uma retificação' using errcode = 'P0001';
  end if;
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.supersedes_id is distinct from old.supersedes_id or new.user_created is distinct from old.user_created
     or new.date_created <> old.date_created then
    raise exception 'A evolução não pode mudar de consultório, paciente, autor ou versão' using errcode = 'P0001';
  end if;
  if new.appointment_id is distinct from old.appointment_id and new.appointment_id is not null and not exists (
    select 1 from appointments where id = new.appointment_id and patient_id = new.patient_id
  ) then
    raise exception 'A consulta não é deste paciente' using errcode = 'P0001';
  end if;
  new.body := trim(new.body);
  new.date_updated := now();
  if new.signed_at is not null then
    select coalesce(nullif(trim(concat_ws(' ', du.first_name, du.last_name)), ''), du.email) as name,
           case when pp.crn is not null then concat(coalesce(pp.crn_region, 'CRN'), ' ', pp.crn) end as crn
      into u
      from directus_users du left join professional_profiles pp on pp.user_id = du.id
     where du.id = old.user_created;
    if not found then
      raise exception 'Evolução sem autor não pode ser assinada' using errcode = 'P0001';
    end if;
    new.signed_at := now(); new.signer_name := u.name; new.signer_crn := u.crn;
  else
    new.signer_name := null; new.signer_crn := null;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.feeding_intro_progress_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and (new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.kind <> old.kind or new.item <> old.item) then
    raise exception 'O registro não pode mudar de criança ou de item' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  -- Quem registra: owner ou nutricionista do consultório, ou a conta ligada ao paciente (o responsável, pelo app)
  if new.recorded_by is null then
    raise exception 'Registro sem autor' using errcode = 'P0001';
  end if;
  if is_clinical_member(new.organization_id, new.recorded_by) then
    new.by_guardian := false;
  elsif exists (select 1 from patients where id = new.patient_id and app_user_id = new.recorded_by and status = 'active') then
    new.by_guardian := true;
  else
    raise exception 'Só o nutricionista ou o responsável ligado ao app registra a introdução alimentar' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then new.date_updated := now(); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.financial_categories_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then
      if new.user_created is not null then
        raise exception 'Categorias padrão só são criadas pela equipe da Rafanutri' using errcode = 'P0001';
      end if;
    elsif new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista cria categorias' using errcode = 'P0001';
    end if;
  elsif new.organization_id is distinct from old.organization_id or new.kind <> old.kind then
    raise exception 'A categoria não muda de consultório nem de tipo' using errcode = 'P0001';
  end if;
  new.name := trim(new.name);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.financial_transactions_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  cat financial_categories;
begin
  if tg_op = 'DELETE' then
    -- apagar o consultório leva os lançamentos junto (cascata): aí não há ator
    if not exists (select 1 from organizations where id = old.organization_id) then
      return old;
    end if;
    if not is_clinical_member(old.organization_id, audit_actor()) then
      raise exception 'Só owner ou nutricionista exclui lançamentos' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members where organization_id = new.organization_id and user_id = new.user_created
    ) then
      raise exception 'Só membros do consultório lançam no financeiro' using errcode = 'P0001';
    end if;
    new.date_created := now();
    new.date_updated := null;
  else
    if new.organization_id <> old.organization_id or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
      raise exception 'O lançamento não muda de consultório nem de autor' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;

  select * into cat from financial_categories where id = new.category_id;
  if cat.id is null or cat.kind <> new.kind or (cat.organization_id is not null and cat.organization_id <> new.organization_id) then
    raise exception 'Categoria inválida para este lançamento' using errcode = 'P0001';
  end if;
  if new.patient_id is not null and not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente de outro consultório' using errcode = 'P0001';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from appointments where id = new.appointment_id and organization_id = new.organization_id
      and (new.patient_id is null or patient_id = new.patient_id)
  ) then
    raise exception 'Consulta de outro consultório ou de outro paciente' using errcode = 'P0001';
  end if;
  new.description := trim(new.description);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.foods_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.organization_id is null then
    if tg_op = 'INSERT' and new.user_created is not null then
      raise exception 'A base pública de alimentos só é alterada pela equipe da Rafanutri' using errcode = 'P0001';
    end if;
    if new.kind <> 'food' then
      raise exception 'Preparação precisa pertencer a um consultório' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.source_id is distinct from (select id from food_sources where code = 'CUSTOM') then
    raise exception 'Alimento de consultório deve ser da fonte CUSTOM' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cadastra alimentos' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id or new.kind <> old.kind then
      raise exception 'O alimento não pode mudar de consultório nem de tipo' using errcode = 'P0001';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.lactations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A lactação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  else
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and coalesce(sex, 'female') = 'female') then
      raise exception 'Paciente não encontrada neste consultório' using errcode = 'P0001';
    end if;
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório registra a lactação' using errcode = 'P0001';
    end if;
  end if;
  if new.baby_patient_id is not null and new.baby_patient_id is distinct from (case when tg_op = 'UPDATE' then old.baby_patient_id end)
     and not exists (select 1 from patients where id = new.baby_patient_id and organization_id = new.organization_id) then
    raise exception 'O bebê precisa ser paciente do mesmo consultório' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.meal_plan_templates_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare t text;
begin
  if new.tags is null or jsonb_typeof(new.tags) <> 'array' then
    raise exception 'Etiquetas devem ser uma lista' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_array_elements(new.tags) e where jsonb_typeof(e) <> 'string') then
    raise exception 'Etiquetas devem ser textos' using errcode = 'P0001';
  end if;
  new.tags := coalesce(
    (select jsonb_agg(x order by x) from (select distinct lower(trim(v)) as x from jsonb_array_elements_text(new.tags) as v) s where x <> ''),
    '[]'::jsonb);
  for t in select jsonb_array_elements_text(new.tags) loop
    if length(t) > 30 then raise exception 'Etiqueta muito longa: %', t using errcode = 'P0001'; end if;
  end loop;
  if tg_op = 'INSERT' then
    if new.organization_id is not null and new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos de plano' using errcode = 'P0001';
    end if;
    if new.source_plan_id is not null and not exists (
      select 1 from meal_plans where id = new.source_plan_id and organization_id = new.organization_id
    ) then
      raise exception 'O plano de origem não é deste consultório' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception 'O modelo não pode mudar de consultório' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.meal_plans_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'O plano nasce como rascunho' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'O paciente não pertence a este consultório' using errcode = 'P0001';
    end if;
    if new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria planos' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
    raise exception 'O plano não pode mudar de consultório ou de paciente' using errcode = 'P0001';
  end if;
  if old.status <> 'draft' and (
    new.meals is distinct from old.meals or new.targets is distinct from old.targets or
    new.mode is distinct from old.mode or new.guidelines is distinct from old.guidelines or new.title is distinct from old.title
  ) then
    raise exception 'Plano publicado ou arquivado não pode ser alterado: crie uma nova versão' using errcode = 'P0001';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Plano arquivado não volta a ser publicado: crie uma nova versão' using errcode = 'P0001';
  end if;
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'Plano publicado não volta a ser rascunho' using errcode = 'P0001';
  end if;

  if new.status = 'published' and old.status = 'draft' then
    -- arquiva o publicado anterior do mesmo paciente
    update meal_plans set status = 'archived' where patient_id = new.patient_id and status = 'published' and id <> new.id;
    new.published_at := now();
    new.valid_until := coalesce(new.valid_until, current_date + 30);
  end if;
  new.date_updated := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.nutrition_screenings_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Triagem registrada não muda: registre uma nova' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
    raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
  end if;
  if new.screened_by is null or not is_clinical_member(new.organization_id, new.screened_by) then
    raise exception 'Só owner ou nutricionista do consultório registra triagens' using errcode = 'P0001';
  end if;
  if new.screened_at > now() + interval '5 minutes' then
    raise exception 'Data da triagem no futuro' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.patient_app_invites_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório convida pacientes' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem convite' using errcode = 'P0001';
    end if;
    new.email := lower(trim(new.email));
    new.used_at := null; new.used_by := null; new.revoked_at := null;
    new.date_created := now();
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '7 days');
    return new;
  end if;
  -- UPDATE: só marcar uso ou revogação, uma vez
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.email <> old.email
     or new.token_hash <> old.token_hash or new.expires_at <> old.expires_at or new.date_created <> old.date_created
     or new.user_created is distinct from old.user_created then
    raise exception 'O convite não pode ser alterado' using errcode = 'P0001';
  end if;
  if (old.used_at is not null and new.used_at is distinct from old.used_at)
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'Convite já usado ou revogado' using errcode = 'P0001';
  end if;
  if new.used_at is not null and new.revoked_at is not null and old.used_at is null then
    raise exception 'Convite revogado não pode ser usado' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.patient_guardians_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'O responsável não pode mudar de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  else
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id) then
      raise exception 'Paciente não encontrado neste consultório' using errcode = 'P0001';
    end if;
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cadastra responsáveis' using errcode = 'P0001';
    end if;
  end if;
  if new.email is not null then new.email := lower(btrim(new.email)); end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.patient_packages_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista vende pacotes' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório compram pacotes' using errcode = 'P0001';
    end if;
    if new.package_id is not null and not exists (select 1 from service_packages where id = new.package_id and organization_id = new.organization_id) then
      raise exception 'Pacote de outro consultório' using errcode = 'P0001';
    end if;
    new.sessions_used := 0;
    new.date_created := now();
  else
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.sessions_total <> old.sessions_total
       or new.user_created is distinct from old.user_created then
      raise exception 'O pacote vendido não muda de paciente nem de número de sessões' using errcode = 'P0001';
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then
      raise exception 'Pacote cancelado não volta' using errcode = 'P0001';
    end if;
  end if;
  new.name := trim(new.name);
  if new.status <> 'cancelled' then
    new.status := patient_package_status(new);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.patient_recipes_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id or new.recipe_food_id <> old.recipe_food_id then
      raise exception 'O envio não muda de paciente nem de receita' using errcode = 'P0001';
    end if;
    new.date_created := old.date_created;
    new.date_updated := now();
    return new;
  end if;
  if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
    raise exception 'Só owner ou nutricionista do consultório envia receitas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
    raise exception 'Só pacientes ativos do consultório recebem receitas' using errcode = 'P0001';
  end if;
  if not exists (select 1 from foods where id = new.recipe_food_id and kind = 'recipe' and organization_id = new.organization_id) then
    raise exception 'Só receitas do próprio consultório podem ser enviadas' using errcode = 'P0001';
  end if;
  new.date_created := now();
  new.date_updated := null;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.patient_recommendations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  reading boolean := coalesce(current_setting('rafanutri.patient_read', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria recomendações' using errcode = 'P0001';
    end if;
    if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and status = 'active') then
      raise exception 'Só pacientes ativos do consultório recebem recomendações' using errcode = 'P0001';
    end if;
    new.read_at := null;
    new.date_created := now();
    new.date_updated := null;
    new.published_at := case when new.status = 'published' then now() else null end;
    return new;
  end if;

  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.user_created is distinct from old.user_created or new.date_created <> old.date_created then
    raise exception 'A recomendação não muda de paciente nem de autor' using errcode = 'P0001';
  end if;

  if new.read_at is distinct from old.read_at then
    -- leitura: só pelo endpoint do paciente, uma vez, em publicada, sem mudar mais nada
    if not reading then
      raise exception 'A leitura só é marcada pelo paciente' using errcode = 'P0001';
    end if;
    if old.read_at is not null or new.read_at is null or old.status <> 'published'
       or new.category <> old.category or new.title <> old.title or new.body <> old.body
       or new.pinned <> old.pinned or new.status <> old.status or new.published_at is distinct from old.published_at then
      raise exception 'Leitura inválida' using errcode = 'P0001';
    end if;
    new.date_updated := old.date_updated;
    return new;
  end if;

  if reading then
    raise exception 'O paciente só marca a leitura' using errcode = 'P0001';
  end if;

  if new.status = 'published' and old.status = 'draft' then
    new.published_at := now();
    new.read_at := null;
  elsif new.status = 'draft' then
    new.published_at := null;
    new.read_at := null;
  else
    new.published_at := old.published_at;
    if new.title <> old.title or new.body <> old.body then
      new.read_at := null;
    end if;
  end if;
  new.date_updated := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.pregnancies_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id then
      raise exception 'A gestação não pode mudar de consultório ou de paciente' using errcode = 'P0001';
    end if;
    new.date_updated := now();
    return new;
  end if;
  if not exists (select 1 from patients where id = new.patient_id and organization_id = new.organization_id and coalesce(sex, 'female') = 'female') then
    raise exception 'Paciente não encontrada neste consultório' using errcode = 'P0001';
  end if;
  if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
    raise exception 'Só owner ou nutricionista do consultório registra a gestação' using errcode = 'P0001';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.public_profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.nutritionist_id is not null and not is_clinical_member(new.organization_id, new.nutritionist_id) then
    raise exception 'O nutricionista da agenda precisa ser do consultório' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.questionnaire_templates_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is not null and new.user_created is not null and not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria modelos' using errcode = 'P0001';
    end if;
    new.version := 1;
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'O modelo não pode mudar de consultório' using errcode = 'P0001';
  end if;
  if new.schema is distinct from old.schema then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  new.date_updated := now();
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.service_packages_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista cria pacotes' using errcode = 'P0001';
    end if;
  elsif new.organization_id <> old.organization_id then
    raise exception 'O pacote não muda de consultório' using errcode = 'P0001';
  end if;
  new.name := trim(new.name);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.text_snippets_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.organization_id is null then
      if new.user_created is not null then
        raise exception 'Textos da biblioteca da plataforma só são criados pela equipe da Rafanutri' using errcode = 'P0001';
      end if;
    elsif new.user_created is null or not is_clinical_member(new.organization_id, new.user_created) then
      raise exception 'Só owner ou nutricionista do consultório cria textos' using errcode = 'P0001';
    end if;
  else
    if new.organization_id is distinct from old.organization_id then
      raise exception 'O texto não pode mudar de consultório' using errcode = 'P0001';
    end if;
    new.date_updated := now();
  end if;
  new.category := trim(new.category);
  new.title := trim(new.title);
  new.body := trim(new.body);
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.leads_events()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into crm_events (organization_id, lead_id, patient_id, from_stage, to_stage, note, user_id)
    values (new.organization_id, new.id, new.patient_id, case when tg_op = 'UPDATE' then old.stage end, new.stage,
            case when new.stage = 'lost' then new.lost_reason end,
            coalesce(audit_actor(), new.user_created));
  end if;
  return null;
end $function$;

insert into schema_migrations (version) values ('0068_clinical_member') on conflict do nothing;

commit;
