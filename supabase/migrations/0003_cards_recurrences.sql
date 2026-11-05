-- =============================================================================
-- Flowly — cartões, faturas, recorrências e exclusão de conta
-- Rode no Supabase depois do 0002.
-- As funções rodam com as permissões de quem chama (RLS vale), exceto a de
-- exclusão de conta, que só apaga o próprio usuário logado.
-- =============================================================================

-- Totais de cada fatura: compras - estornos - pagamentos.
create view public.card_bill_totals with (security_invoker = true) as
select
  b.id as bill_id,
  b.user_id,
  b.card_id,
  b.reference_month,
  b.due_date,
  b.status,
  coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)     as charges_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0)      as credits_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'transfer_in'), 0) as payments_cents,
  coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0)
    - coalesce(sum(t.amount_cents) filter (where t.type in ('income', 'transfer_in')), 0) as balance_cents
from public.card_bills b
left join public.transactions t on t.card_bill_id = b.id
group by b.id;

-- -----------------------------------------------------------------------------
-- Compra no cartão (à vista ou parcelada), tudo de uma vez.
-- p_parcels: [{ "number": 1, "amount_cents": 3334, "occurred_on": "2026-11-20",
--               "reference_month": "2026-12-01", "due_date": "2026-12-12" }, ...]
-- (as datas e faturas são calculadas pelo app em src/lib/cards.ts)
-- -----------------------------------------------------------------------------
create function public.create_card_purchase(
  p_card_id     uuid,
  p_description text,
  p_category_id uuid,
  p_notes       text,
  p_parcels     jsonb
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_n     int := jsonb_array_length(p_parcels);
  v_total bigint;
  v_inst  uuid;
  v_bill  uuid;
  v_desc  text := left(coalesce(nullif(trim(p_description), ''), 'Compra no cartão'), 180);
  p       jsonb;
begin
  if v_n < 1 or v_n > 72 then
    raise exception 'Número de parcelas inválido.' using errcode = '22023';
  end if;
  select sum((x ->> 'amount_cents')::bigint) into v_total from jsonb_array_elements(p_parcels) x;

  if v_n > 1 then
    insert into public.installments (description, total_cents, installment_count)
    values (v_desc, v_total, v_n) returning id into v_inst;
  end if;

  for p in select * from jsonb_array_elements(p_parcels) loop
    insert into public.card_bills (card_id, reference_month, due_date)
    values (p_card_id, (p ->> 'reference_month')::date, (p ->> 'due_date')::date)
    on conflict (card_id, reference_month) do update set due_date = public.card_bills.due_date
    returning id into v_bill;

    insert into public.transactions
      (type, amount_cents, occurred_on, description, card_bill_id, category_id, status, notes, installment_id, installment_number)
    values (
      'expense',
      (p ->> 'amount_cents')::bigint,
      (p ->> 'occurred_on')::date,
      case when v_n > 1 then format('%s (%s/%s)', v_desc, p ->> 'number', v_n) else v_desc end,
      v_bill,
      p_category_id,
      'paid',
      nullif(trim(p_notes), ''),
      v_inst,
      case when v_n > 1 then (p ->> 'number')::smallint end
    );
  end loop;
end $$;

-- Fatura de um mês (cria se ainda não existir) — usada para estornos e para abrir a fatura na tela.
create function public.ensure_card_bill(p_card_id uuid, p_reference_month date, p_due_date date)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_bill uuid;
begin
  insert into public.card_bills (card_id, reference_month, due_date)
  values (p_card_id, p_reference_month, p_due_date)
  on conflict (card_id, reference_month) do update set due_date = public.card_bills.due_date
  returning id into v_bill;
  return v_bill;
end $$;

-- -----------------------------------------------------------------------------
-- Pagamento de fatura: sai da conta e entra na fatura (as duas pernas juntas).
-- Não conta como despesa de novo: as compras já foram contadas quando aconteceram.
-- -----------------------------------------------------------------------------
create function public.pay_card_bill(p_bill_id uuid, p_account_id uuid, p_amount_cents bigint, p_paid_on date)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_group uuid := gen_random_uuid();
  v_card  text;
  v_month date;
  v_left  bigint;
begin
  select c.name, b.reference_month into v_card, v_month
  from public.card_bills b join public.credit_cards c on c.id = b.card_id
  where b.id = p_bill_id;
  if not found then
    raise exception 'Fatura não encontrada.' using errcode = 'P0002';
  end if;

  insert into public.transactions (type, amount_cents, occurred_on, description, account_id, status, transfer_group)
  values ('transfer_out', p_amount_cents, p_paid_on,
          format('Pagamento fatura %s %s', v_card, to_char(v_month, 'MM/YYYY')), p_account_id, 'paid', v_group);
  insert into public.transactions (type, amount_cents, occurred_on, description, card_bill_id, status, transfer_group)
  values ('transfer_in', p_amount_cents, p_paid_on,
          format('Pagamento fatura %s %s', v_card, to_char(v_month, 'MM/YYYY')), p_bill_id, 'paid', v_group);

  select balance_cents into v_left from public.card_bill_totals where bill_id = p_bill_id;
  update public.card_bills set status = case when v_left <= 0 then 'paid' else status end where id = p_bill_id;
end $$;

-- -----------------------------------------------------------------------------
-- Recorrências: o app calcula as datas (src/lib/recurrence.ts) e esta função grava
-- as ocorrências e avança o marcador, sem nunca duplicar a mesma data.
-- p_rows: [{ "occurred_on": "2026-11-13" }, ...]
-- -----------------------------------------------------------------------------
create function public.generate_recurrence_rows(p_recurrence_id uuid, p_last_generated date, p_rows jsonb)
returns int
language plpgsql security invoker set search_path = public as $$
declare
  r public.recurrences;
  v_count int := 0;
begin
  select * into r from public.recurrences where id = p_recurrence_id and active for update;
  if not found then return 0; end if;

  insert into public.transactions
    (type, amount_cents, occurred_on, description, account_id, category_id, status, recurrence_id)
  select
    r.type,
    coalesce(r.amount_cents, 1),
    (x ->> 'occurred_on')::date,
    r.description,
    r.account_id,
    r.category_id,
    case when r.is_variable then 'pending' else 'paid' end,
    r.id
  from jsonb_array_elements(p_rows) x
  on conflict (recurrence_id, occurred_on) where recurrence_id is not null do nothing;
  get diagnostics v_count = row_count;

  update public.recurrences
  set last_generated = greatest(coalesce(last_generated, p_last_generated), p_last_generated)
  where id = p_recurrence_id;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Exclusão da própria conta (LGPD): apaga o usuário e, em cascata, todos os dados dele.
-- -----------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.create_card_purchase(uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.ensure_card_bill(uuid, date, date) from public, anon;
revoke all on function public.pay_card_bill(uuid, uuid, bigint, date) from public, anon;
revoke all on function public.generate_recurrence_rows(uuid, date, jsonb) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.create_card_purchase(uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.ensure_card_bill(uuid, date, date) to authenticated;
grant execute on function public.pay_card_bill(uuid, uuid, bigint, date) to authenticated;
grant execute on function public.generate_recurrence_rows(uuid, date, jsonb) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

create index card_bills_user_month_idx on public.card_bills (user_id, reference_month desc);
create index recurrences_user_idx on public.recurrences (user_id) where active;
