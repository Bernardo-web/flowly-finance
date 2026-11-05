-- =============================================================================
-- Flowly — ajuste de saldo
-- Rode no Supabase depois do 0003.
--
-- Problema: o "saldo inicial" vale para ANTES do primeiro lançamento. Quem cadastra a
-- conta com o saldo de hoje e depois importa meses de extrato vê o histórico ser
-- descontado de novo, e o saldo fica errado.
-- Solução: um lançamento de "ajuste de saldo" que leva a conta ao valor real informado.
-- Ele mexe no saldo, mas não conta como receita nem despesa nos relatórios.
-- =============================================================================

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('income', 'expense', 'transfer_in', 'transfer_out', 'adjustment_in', 'adjustment_out'));

-- saldo: entradas somam (receita, transferência recebida, ajuste para cima), o resto subtrai
create or replace view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.initial_balance_cents
    + coalesce(sum(case when t.type in ('income', 'transfer_in', 'adjustment_in') then t.amount_cents
                        else -t.amount_cents end)
               filter (where t.status = 'paid'), 0) as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- Leva o saldo da conta ao valor real informado, com um único lançamento de ajuste.
-- Devolve a diferença aplicada (0 se já estava certo).
create function public.set_account_balance(p_account_id uuid, p_target_cents bigint, p_on date, p_import_id uuid default null)
returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  v_current bigint;
  v_diff    bigint;
begin
  select balance_cents into v_current from public.account_balances where account_id = p_account_id;
  if not found then
    raise exception 'Conta não encontrada.' using errcode = 'P0002';
  end if;
  v_diff := p_target_cents - v_current;
  if v_diff = 0 then return 0; end if;

  -- p_import_id: ajuste feito no fim de uma importação; desfazer a importação apaga o ajuste junto
  insert into public.transactions (type, amount_cents, occurred_on, description, account_id, status, import_id)
  values (case when v_diff > 0 then 'adjustment_in' else 'adjustment_out' end,
          abs(v_diff), p_on, 'Ajuste de saldo', p_account_id, 'paid', p_import_id);
  return v_diff;
end $$;

revoke all on function public.set_account_balance(uuid, bigint, date, uuid) from public, anon;
grant execute on function public.set_account_balance(uuid, bigint, date, uuid) to authenticated;
