-- Testes de cartões, recorrências e exclusão de conta (rodar depois de rls_test e import_test).
\set ON_ERROR_STOP on
\o /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public.credit_cards (name, limit_cents, closing_day, due_day) values ('Ourocard', 200000, 5, 12);
select id as card from public.credit_cards where name = 'Ourocard' \gset
select id as acc from public.accounts where name = 'BB do amigo' \gset

-- 1) compra parcelada em 3x: 3 faturas, 3 lançamentos, total exato
select public.create_card_purchase(:'card', 'Celular', null, null, '[
  {"number":1,"amount_cents":3334,"occurred_on":"2026-11-20","reference_month":"2026-12-01","due_date":"2026-12-12"},
  {"number":2,"amount_cents":3333,"occurred_on":"2026-12-20","reference_month":"2027-01-01","due_date":"2027-01-12"},
  {"number":3,"amount_cents":3333,"occurred_on":"2027-01-20","reference_month":"2027-02-01","due_date":"2027-02-12"}]');
-- compra à vista na mesma fatura de dezembro
select public.create_card_purchase(:'card', 'Mercado', null, null,
  '[{"number":1,"amount_cents":5000,"occurred_on":"2026-11-25","reference_month":"2026-12-01","due_date":"2026-12-12"}]');
\o

do $$ begin
  assert (select count(*) from public.card_bills) = 3, 'faturas não criadas';
  assert (select total_cents from public.installments where description = 'Celular') = 10000, 'total do parcelamento';
  assert (select balance_cents from public.card_bill_totals where reference_month = '2026-12-01') = 8334, 'total da fatura de dezembro';
  assert exists (select 1 from public.transactions where description = 'Celular (2/3)' and installment_number = 2), 'descrição da parcela';
  -- compras no cartão não mexem no saldo da conta
  assert (select balance_cents from public.account_balances) = 7450, 'compra no cartão alterou saldo da conta';
end $$;

-- 2) pagar a fatura de dezembro inteira: sai da conta, fatura fica paga, não vira despesa
\o /dev/null
select id as bill from public.card_bills where reference_month = '2026-12-01' \gset
select public.pay_card_bill(:'bill', :'acc', 8334, '2026-12-12');
\o
do $$ begin
  assert (select balance_cents from public.card_bill_totals where reference_month = '2026-12-01') = 0, 'fatura não zerou';
  assert (select status from public.card_bills where reference_month = '2026-12-01') = 'paid', 'fatura não marcada como paga';
  assert (select balance_cents from public.account_balances) = 7450 - 8334, 'pagamento não saiu da conta';
  assert (select count(*) from public.transactions where type = 'expense' and description like 'Pagamento%') = 0, 'pagamento contado como despesa';
end $$;

-- 3) recorrência: gera, não duplica, avança o marcador; variável entra pendente
\o /dev/null
insert into public.recurrences (type, description, amount_cents, days_of_month, account_id)
values ('income', 'Salário', 150000, '{15,30}', :'acc');
insert into public.recurrences (type, description, is_variable, days_of_month, account_id)
values ('income', 'TikTok', true, '{15}', :'acc');
select id as sal from public.recurrences where description = 'Salário' \gset
select id as tik from public.recurrences where description = 'TikTok' \gset
select public.generate_recurrence_rows(:'sal', '2026-11-15', '[{"occurred_on":"2026-11-13"}]');
select public.generate_recurrence_rows(:'sal', '2026-11-15', '[{"occurred_on":"2026-11-13"}]');
select public.generate_recurrence_rows(:'tik', '2026-11-15', '[{"occurred_on":"2026-11-13"}]');
\o
do $$ begin
  assert (select count(*) from public.transactions where description = 'Salário') = 1, 'recorrência duplicada';
  assert (select status from public.transactions where description = 'Salário') = 'paid', 'valor fixo deveria entrar pago';
  assert (select status from public.transactions where description = 'TikTok') = 'pending', 'valor variável deveria entrar pendente';
  assert (select last_generated from public.recurrences where description = 'Salário') = '2026-11-15', 'marcador não avançou';
end $$;

-- 4) outro usuário não usa o cartão nem a recorrência de alguém
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v_card uuid; v_rec uuid;
begin
  reset role;
  select id into v_card from public.credit_cards where name = 'Ourocard';
  select id into v_rec from public.recurrences where description = 'Salário';
  set local role authenticated;
  begin
    perform public.create_card_purchase(v_card, 'invasão', null, null,
      '[{"number":1,"amount_cents":100,"occurred_on":"2026-11-20","reference_month":"2026-12-01","due_date":"2026-12-12"}]');
    raise exception 'comprou no cartão de outro usuário';
  -- barrado pela chave composta ou pelo RLS da fatura, conforme o caso
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  assert public.generate_recurrence_rows(v_rec, '2026-12-31', '[{"occurred_on":"2026-11-30"}]') = 0, 'gerou recorrência de outro usuário';
end $$;

-- 5) excluir a própria conta apaga tudo do usuário e nada dos outros
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'perfil não apagado';
  assert not exists (select 1 from public.transactions where user_id = '00000000-0000-0000-0000-00000000000b'), 'lançamentos não apagados';
  assert not exists (select 1 from public.credit_cards where user_id = '00000000-0000-0000-0000-00000000000b'), 'cartões não apagados';
  assert exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'apagou outro usuário';
end $$;

\echo 'OK: testes de cartões, recorrências e exclusão passaram'
