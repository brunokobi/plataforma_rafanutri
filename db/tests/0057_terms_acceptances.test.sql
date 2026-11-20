-- Testes da migração 0057 (aceite dos documentos legais). Transação desfeita no fim.
begin;

do $$
declare u uuid := gen_random_uuid(); ok boolean; aid bigint;
begin
  insert into directus_users (id, email) values (u, 'ta-user@example.com');
  insert into terms_acceptances (user_id, document, version) values (u, 'professional_terms', '2026-11-20') returning terms_acceptances.id into aid;
  ok := false; begin insert into terms_acceptances (user_id, document, version) values (u, 'professional_terms', '2026-11-20');
  exception when unique_violation then ok := true; end; assert ok, 'um aceite por versão';
  ok := false; begin insert into terms_acceptances (user_id, document, version) values (u, 'outro', '2026-11-20');
  exception when check_violation then ok := true; end; assert ok, 'documento válido';
  ok := false; begin update terms_acceptances set version = '2026-01-01' where terms_acceptances.id = aid;
  exception when raise_exception then ok := true; end; assert ok, 'aceite não muda';
  ok := false; begin delete from terms_acceptances where terms_acceptances.id = aid;
  exception when raise_exception then ok := true; end; assert ok, 'aceite não se apaga';
  delete from directus_users where directus_users.id = u;
  assert not exists (select 1 from terms_acceptances where user_id = u), 'some com a conta';
end $$;

rollback;
