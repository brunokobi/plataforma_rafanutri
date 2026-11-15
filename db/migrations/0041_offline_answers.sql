-- RN-149 — Modo offline: a resposta guarda o horário em que foi dada no aparelho. Idempotente.
-- O app envia `answered_at` ao sincronizar a fila; o banco aceita se estiver nas últimas 72 h (e não no
-- futuro além de 5 min de relógio adiantado); fora disso, usa o horário do servidor.

begin;

create or replace function checklist_answers_guard() returns trigger language plpgsql as $$
declare st text;
begin
  -- Item apagado do modelo (FK on delete set null): só a referência muda, em qualquer situação.
  if tg_op = 'UPDATE' and old.item_id is not null and new.item_id is null
     and (to_jsonb(new) - 'item_id') = (to_jsonb(old) - 'item_id') then
    return new;
  end if;
  if tg_op = 'DELETE' then
    select status into st from checklist_runs where id = old.run_id;
    if st is null then return old; end if; -- execução sendo apagada (cascata)
    raise exception 'Respostas não são apagadas' using errcode = 'P0001';
  end if;
  select status into st from checklist_runs where id = new.run_id;
  if tg_op = 'INSERT' then
    if st is distinct from 'in_progress' then
      raise exception 'Checklist concluído ou cancelado não pode ser alterado' using errcode = 'P0001';
    end if;
    new.value := null; new.number_value := null; new.comment := null; new.photo := null;
    new.answered_by := null; new.answered_at := null;
    return new;
  end if;
  if st is distinct from 'in_progress' then
    raise exception 'Checklist concluído ou cancelado não pode ser alterado' using errcode = 'P0001';
  end if;
  if new.run_id <> old.run_id or new.position <> old.position or new.prompt <> old.prompt or new.kind <> old.kind
     or new.section is distinct from old.section or new.critical <> old.critical or new.photo_on_fail <> old.photo_on_fail
     or new.min_value is distinct from old.min_value or new.max_value is distinct from old.max_value
     or new.unit is distinct from old.unit or new.item_id is distinct from old.item_id then
    raise exception 'O item do checklist não muda' using errcode = 'P0001';
  end if;
  if new.kind = 'number' then
    new.value := case when new.value = 'na' then 'na' else checklist_number_value(new.number_value, new.min_value, new.max_value) end;
    if new.value = 'na' then new.number_value := null; end if;
  else
    new.number_value := null;
  end if;
  -- Horário da resposta: o do aparelho (modo offline) se for das últimas 72 h; senão, o do servidor.
  if new.answered_at is distinct from old.answered_at and new.answered_at is not null
     and new.answered_at between now() - interval '72 hours' and now() + interval '5 minutes' then
    new.answered_at := least(new.answered_at, now());
  else
    new.answered_at := now();
  end if;
  return new;
end $$;

insert into schema_migrations (version) values ('0041_offline_answers') on conflict do nothing;

commit;
