-- Correção da 0015: a exclusão em cascata (consultório ou paciente apagado pelo administrador, ex.:
-- pedido de exclusão LGPD ou limpeza de teste) precisa levar as evoluções junto. Idempotente.
--   * o gatilho só barra o DELETE direto de evolução assinada (pg_trigger_depth() = 1); na cascata,
--     disparada pelas chaves estrangeiras, a profundidade é maior;
--   * supersedes_id passa de RESTRICT (checado linha a linha) para NO ACTION (checado no fim do
--     comando), para que original e retificação saiam juntas.

begin;

create or replace function clinical_notes_guard() returns trigger language plpgsql as $$
declare prev clinical_notes; u record;
begin
  if tg_op = 'DELETE' then
    if old.signed_at is not null and pg_trigger_depth() = 1 then
      raise exception 'Evolução assinada não pode ser apagada; faça uma retificação' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.user_created is null or not exists (
      select 1 from organization_members
      where organization_id = new.organization_id and user_id = new.user_created and role in ('owner', 'nutritionist')
    ) then
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
end $$;

alter table clinical_notes drop constraint if exists clinical_notes_supersedes_id_fkey;
alter table clinical_notes add constraint clinical_notes_supersedes_id_fkey
  foreign key (supersedes_id) references clinical_notes (id) on delete no action;

insert into schema_migrations (version) values ('0016_clinical_notes_cascade') on conflict do nothing;

commit;
