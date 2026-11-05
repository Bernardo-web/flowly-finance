-- Testes do schema: convites, categorias padrão e isolamento entre usuários.
-- Cada bloco falha com erro se a regra não for respeitada.
\set ON_ERROR_STOP on

-- 1) primeiro usuário entra sem convite e vira admin
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000a', 'admin@teste', '{"full_name":"Admin"}');

do $$ begin
  assert (select is_admin from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
    'primeiro usuário deveria ser admin';
  assert (select count(*) from public.categories where user_id = '00000000-0000-0000-0000-00000000000a') = 29,
    'categorias padrão não foram criadas';
end $$;

-- 2) segundo usuário sem convite é recusado
do $$ begin
  begin
    insert into auth.users (email) values ('intruso@teste');
    raise exception 'cadastro sem convite deveria falhar';
  exception when sqlstate 'P0001' then
    if sqlerrm not like 'Cadastro somente por convite%' then raise; end if;
  end;
end $$;

-- 3) admin cria convite de 1 uso; convidado entra; segundo uso é recusado
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.create_invite(1, 7, 'amigo') as code \gset
reset role;

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000000b', 'amigo@teste',
        jsonb_build_object('invite_code', :'code', 'full_name', 'Amigo'));

do $$ begin
  assert not (select is_admin from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
    'convidado não pode ser admin';
end $$;

do $$ begin
  begin
    insert into auth.users (email, raw_user_meta_data)
    values ('outro@teste', jsonb_build_object('invite_code', (select code from public.invites limit 1)));
    raise exception 'convite de 1 uso foi aceito duas vezes';
  exception when sqlstate 'P0001' then null;
  end;
end $$;

-- 4) convidado não pode criar convites
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    perform public.create_invite();
    raise exception 'não-admin criou convite';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5) isolamento: cada um cria uma conta e um lançamento
insert into public.accounts (name, kind, initial_balance_cents) values ('BB do amigo', 'checking', 10000);
insert into public.transactions (type, amount_cents, occurred_on, description, account_id, status)
select 'expense', 2550, current_date, 'Mercado', id, 'paid' from public.accounts;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.accounts (name, kind) values ('Conta do admin', 'checking');

do $$ begin
  assert (select count(*) from public.accounts) = 1, 'admin enxerga conta de outro usuário';
  assert (select count(*) from public.transactions) = 0, 'admin enxerga lançamento de outro usuário';
  assert (select count(*) from public.categories) = 29, 'admin enxerga categorias de outro usuário';
end $$;

-- 6) admin não consegue lançar na conta do amigo (FK composta + RLS)
reset role;
do $$
declare v_conta_amigo uuid;
begin
  select id into v_conta_amigo from public.accounts where name = 'BB do amigo';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
  set local role authenticated;
  begin
    insert into public.transactions (type, amount_cents, occurred_on, description, account_id)
    values ('expense', 100, current_date, 'invasão', v_conta_amigo);
    raise exception 'admin lançou na conta de outro usuário';
  exception when foreign_key_violation then null;
  end;
end $$;
reset role;

-- 7) não pode se promover a admin
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    update public.profiles set is_admin = true;
    raise exception 'usuário conseguiu se promover a admin';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 8) saldo calculado: 100,00 - 25,50 = 74,50
do $$ begin
  assert (select balance_cents from public.account_balances) = 7450, 'saldo incorreto';
end $$;

-- 9) anônimo não lê nada
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.transactions;
    raise exception 'anônimo leu lançamentos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo 'OK: todos os testes do banco passaram'
