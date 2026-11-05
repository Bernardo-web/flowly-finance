-- =============================================================================
-- Flowly — importação de extrato em uma única transação
-- Rode no Supabase depois do 0001 (SQL Editor > New query > colar > Run).
--
-- confirm_import grava o registro da importação, todos os lançamentos e as regras
-- de categoria aprendidas de uma vez: se qualquer linha falhar, nada é salvo.
-- Roda com as permissões de quem chama (security invoker), então o RLS vale normalmente.
-- =============================================================================

create function public.confirm_import(
  p_account_id uuid,
  p_bank       text,
  p_format     text,
  p_file_name  text,
  p_rows_total int,
  p_rows       jsonb,
  p_rules      jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_import uuid;
  v_count  int;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha para importar.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Extrato grande demais: importe no máximo 5000 linhas por vez.' using errcode = '22023';
  end if;

  insert into public.imports (account_id, bank, format, file_name, rows_total)
  values (p_account_id, left(p_bank, 20), p_format, left(coalesce(nullif(trim(p_file_name), ''), 'extrato'), 200), greatest(p_rows_total, 0))
  returning id into v_import;

  insert into public.transactions
    (type, amount_cents, occurred_on, description, account_id, category_id, status, import_id, fingerprint, bank_description)
  select
    r ->> 'type',
    (r ->> 'amount_cents')::bigint,
    (r ->> 'occurred_on')::date,
    left(coalesce(nullif(trim(r ->> 'description'), ''), 'Sem descrição'), 200),
    p_account_id,
    nullif(r ->> 'category_id', '')::uuid,
    'paid',
    v_import,
    left(r ->> 'fingerprint', 300),
    left(r ->> 'bank_description', 200)
  from jsonb_array_elements(p_rows) as r;

  get diagnostics v_count = row_count;
  update public.imports set rows_imported = v_count where id = v_import;

  -- aprende: "esta descrição é desta categoria" (a escolha mais recente vence)
  if jsonb_typeof(p_rules) = 'array' then
    insert into public.category_rules (pattern, category_id)
    select distinct on (r ->> 'pattern') left(r ->> 'pattern', 80), (r ->> 'category_id')::uuid
    from jsonb_array_elements(p_rules) as r
    where char_length(r ->> 'pattern') >= 2 and r ->> 'category_id' is not null
    on conflict (user_id, pattern) do update
      set category_id = excluded.category_id,
          hits = public.category_rules.hits + 1,
          updated_at = now();
  end if;

  return v_import;
end $$;

revoke all on function public.confirm_import(uuid, text, text, text, int, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_import(uuid, text, text, text, int, jsonb, jsonb) to authenticated;
