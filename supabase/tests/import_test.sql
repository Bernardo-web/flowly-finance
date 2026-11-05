-- Testes da importação (rodar depois de rls_test.sql, que cria os usuários e contas).
\set ON_ERROR_STOP on
\o /dev/null

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select id as acc from public.accounts where name = 'BB do amigo' \gset
select id as cat from public.categories where slug = 'alimentacao-mercado' \gset

-- 1) importa 3 linhas e aprende uma regra
select public.confirm_import(
  :'acc', 'bb', 'csv', 'extrato.csv', 5,
  jsonb_build_array(
    jsonb_build_object('type','expense','amount_cents',1500,'occurred_on','2026-11-01','description','Mercado Bairro','category_id',:'cat','fingerprint','2026-11-01|-1500|mercado bairro'),
    jsonb_build_object('type','expense','amount_cents',1500,'occurred_on','2026-11-01','description','Mercado Bairro','category_id',:'cat','fingerprint','2026-11-01|-1500|mercado bairro'),
    jsonb_build_object('type','income','amount_cents',4000,'occurred_on','2026-11-02','description','','fingerprint','x')
  ),
  jsonb_build_array(jsonb_build_object('pattern','mercado bairro','category_id',:'cat'))
) as imp \gset
\o

do $$ begin
  assert (select rows_imported from public.imports) = 3, 'rows_imported incorreto';
  assert (select count(*) from public.transactions where import_id is not null) = 3, 'lançamentos não importados';
  assert (select count(*) from public.transactions where description = 'Sem descrição') = 1, 'descrição vazia não tratada';
  assert (select count(*) from public.category_rules where pattern = 'mercado bairro') = 1, 'regra não aprendida';
end $$;

-- 2) linha inválida derruba a importação inteira (nada fica pela metade)
do $$
declare v_acc uuid;
begin
  select id into v_acc from public.accounts where name = 'BB do amigo';
  begin
    perform public.confirm_import(v_acc, 'bb', 'csv', 'ruim.csv', 2, jsonb_build_array(
      jsonb_build_object('type','expense','amount_cents',100,'occurred_on','2026-11-03','description','ok'),
      jsonb_build_object('type','expense','amount_cents',-5,'occurred_on','2026-11-03','description','valor negativo')
    ));
    raise exception 'importação com linha inválida foi aceita';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.imports) = 1, 'importação parcial ficou salva';
end $$;

-- 3) outro usuário não consegue importar para esta conta
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v_acc uuid;
begin
  reset role;
  select id into v_acc from public.accounts where name = 'BB do amigo';
  set local role authenticated;
  begin
    perform public.confirm_import(v_acc, 'bb', 'csv', 'x.csv', 1,
      jsonb_build_array(jsonb_build_object('type','expense','amount_cents',100,'occurred_on','2026-11-03','description','invasão')));
    raise exception 'importou na conta de outro usuário';
  exception when foreign_key_violation then null;
  end;
end $$;

-- 4) desfazer: apagar a importação apaga os lançamentos dela
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
delete from public.imports where id = :'imp';
do $$ begin
  assert (select count(*) from public.transactions where import_id is not null) = 0, 'desfazer não removeu lançamentos';
  assert (select count(*) from public.transactions) = 1, 'desfazer apagou lançamento manual';
end $$;
reset role;

\echo 'OK: testes da importação passaram'
