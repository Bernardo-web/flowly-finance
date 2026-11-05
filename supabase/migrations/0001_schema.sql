-- =============================================================================
-- Flowly — schema inicial
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > colar > Run.
--
-- Princípios:
--   * Todo dado pertence a um usuário (user_id) e o próprio banco garante, via
--     Row Level Security, que cada pessoa só lê e altera as próprias linhas.
--   * Chaves estrangeiras compostas (id, user_id) impedem ligar um lançamento à
--     conta/categoria de OUTRA pessoa, mesmo que alguém tente pela API.
--   * Dinheiro é guardado em centavos (bigint), nunca em ponto flutuante.
--   * Cadastro só por convite, validado dentro do banco (não dá para pular pela API).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfis
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Convites
-- -----------------------------------------------------------------------------
create table public.invites (
  code        text primary key default upper(left(replace(gen_random_uuid()::text, '-', ''), 10)),
  created_by  uuid not null references public.profiles (id) on delete cascade,
  max_uses    int  not null default 1 check (max_uses between 1 and 50),
  uses        int  not null default 0 check (uses >= 0),
  expires_at  timestamptz not null default now() + interval '14 days',
  note        text check (char_length(note) <= 120),
  created_at  timestamptz not null default now()
);

create table public.invite_redemptions (
  invite_code text not null references public.invites (code) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invite_code, user_id)
);

-- -----------------------------------------------------------------------------
-- Contas / carteiras
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 60),
  kind                  text not null check (kind in ('checking', 'savings', 'cash', 'wallet', 'investment')),
  initial_balance_cents bigint not null default 0,
  color                 text not null default '#0f766e' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived              boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (id, user_id)
);

-- -----------------------------------------------------------------------------
-- Cartões de crédito e faturas
-- -----------------------------------------------------------------------------
create table public.credit_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  limit_cents   bigint not null default 0 check (limit_cents >= 0),
  closing_day   smallint not null check (closing_day between 1 and 31),
  due_day       smallint not null check (due_day between 1 and 31),
  color         text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (id, user_id)
);

create table public.card_bills (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  card_id         uuid not null,
  reference_month date not null check (extract(day from reference_month) = 1),
  due_date        date not null,
  status          text not null default 'open' check (status in ('open', 'closed', 'paid')),
  created_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (card_id, reference_month),
  foreign key (card_id, user_id) references public.credit_cards (id, user_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Categorias
-- -----------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  parent_id  uuid,
  kind       text not null check (kind in ('income', 'expense')),
  name       text not null check (char_length(name) between 1 and 40),
  slug       text,                       -- identificador estável das categorias padrão
  icon       text not null default 'circle',
  color      text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, slug),
  foreign key (parent_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Parcelamentos, recorrências e importações
-- -----------------------------------------------------------------------------
create table public.installments (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  description        text not null check (char_length(description) between 1 and 120),
  total_cents        bigint not null check (total_cents > 0),
  installment_count  smallint not null check (installment_count between 2 and 72),
  created_at         timestamptz not null default now(),
  unique (id, user_id)
);

create table public.recurrences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  type           text not null check (type in ('income', 'expense')),
  description    text not null check (char_length(description) between 1 and 120),
  amount_cents   bigint check (amount_cents > 0),     -- valor de referência
  is_variable    boolean not null default false,       -- variável = entra como pendente p/ confirmar
  days_of_month  smallint[] not null check (
                   cardinality(days_of_month) between 1 and 4
                   and 1 <= all (days_of_month) and 31 >= all (days_of_month)),
  weekend_rule   text not null default 'previous_business_day'
                   check (weekend_rule in ('previous_business_day', 'next_business_day', 'keep')),
  account_id     uuid not null,
  category_id    uuid,
  starts_on      date not null default current_date,
  ends_on        date,
  last_generated date,                                 -- até onde já foram criados lançamentos
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  check (is_variable or amount_cents is not null),
  foreign key (user_id) references public.profiles (id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);

create table public.imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  account_id    uuid not null,
  bank          text not null,               -- ex.: 'bb'
  format        text not null check (format in ('csv', 'ofx')),
  file_name     text not null check (char_length(file_name) <= 200),
  rows_total    int not null default 0,
  rows_imported int not null default 0,
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  foreign key (user_id) references public.profiles (id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- Lançamentos
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  type               text not null check (type in ('income', 'expense', 'transfer_in', 'transfer_out')),
  amount_cents       bigint not null check (amount_cents > 0),   -- sempre positivo; o tipo dá o sinal
  occurred_on        date not null,
  description        text not null check (char_length(description) between 1 and 200),
  notes              text check (char_length(notes) <= 1000),
  status             text not null default 'paid' check (status in ('paid', 'pending')),
  account_id         uuid,
  card_bill_id       uuid,
  category_id        uuid,
  transfer_group     uuid,                   -- liga a saída e a entrada de uma transferência
  installment_id     uuid,
  installment_number smallint,
  recurrence_id      uuid,
  import_id          uuid,
  fingerprint        text,                   -- usado para detectar duplicados na importação
  bank_description   text,                   -- texto original do banco, para auditoria
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- exatamente um destino: conta OU fatura de cartão
  check ((account_id is null) <> (card_bill_id is null)),
  check ((type like 'transfer_%') = (transfer_group is not null)),
  check ((installment_id is null) = (installment_number is null)),
  foreign key (user_id) references public.profiles (id) on delete cascade,
  foreign key (account_id, user_id)     references public.accounts (id, user_id) on delete cascade,
  foreign key (card_bill_id, user_id)   references public.card_bills (id, user_id) on delete cascade,
  foreign key (category_id, user_id)    references public.categories (id, user_id) on delete set null (category_id),
  foreign key (installment_id, user_id) references public.installments (id, user_id) on delete cascade,
  foreign key (recurrence_id, user_id)  references public.recurrences (id, user_id) on delete set null (recurrence_id),
  foreign key (import_id, user_id)      references public.imports (id, user_id) on delete cascade
);

create index transactions_user_date_idx    on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx      on public.transactions (account_id) where account_id is not null;
create index transactions_bill_idx         on public.transactions (card_bill_id) where card_bill_id is not null;
create index transactions_category_idx     on public.transactions (category_id);
create index transactions_fingerprint_idx  on public.transactions (user_id, fingerprint) where fingerprint is not null;
-- impede gerar a mesma ocorrência de uma recorrência duas vezes
create unique index transactions_recurrence_once_idx
  on public.transactions (recurrence_id, occurred_on) where recurrence_id is not null;

-- -----------------------------------------------------------------------------
-- Orçamentos e regras de categorização
-- -----------------------------------------------------------------------------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  category_id uuid not null,
  month       date not null check (extract(day from month) = 1),
  limit_cents bigint not null check (limit_cents > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (user_id) references public.profiles (id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create table public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  pattern     text not null check (char_length(pattern) between 2 and 80),  -- texto normalizado
  category_id uuid not null,
  hits        int not null default 1,
  updated_at  timestamptz not null default now(),
  unique (user_id, pattern),
  foreign key (user_id) references public.profiles (id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger transactions_touch before update on public.transactions
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Categorias padrão (criadas para cada novo usuário)
-- -----------------------------------------------------------------------------
create function public.seed_default_categories(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  parent uuid;
  r record;
begin
  for r in
    select * from (values
      -- slug, nome, tipo, ícone, cor, slug do pai
      ('alimentacao',          'Alimentação',          'expense', 'utensils',       '#ea580c', null),
      ('alimentacao-mercado',  'Mercado',              'expense', 'shopping-cart',  '#ea580c', 'alimentacao'),
      ('alimentacao-rest',     'Restaurantes e lanches','expense','coffee',         '#ea580c', 'alimentacao'),
      ('alimentacao-delivery', 'Delivery',             'expense', 'bike',           '#ea580c', 'alimentacao'),
      ('transporte',           'Transporte',           'expense', 'car',            '#2563eb', null),
      ('transporte-comb',      'Combustível',          'expense', 'fuel',           '#2563eb', 'transporte'),
      ('transporte-apps',      'Apps e transporte público','expense','bus',         '#2563eb', 'transporte'),
      ('transporte-manut',     'Manutenção',           'expense', 'wrench',         '#2563eb', 'transporte'),
      ('transporte-estac',     'Estacionamento e pedágio','expense','square-parking','#2563eb','transporte'),
      ('moradia',              'Moradia',              'expense', 'house',          '#0891b2', null),
      ('moradia-aluguel',      'Aluguel',              'expense', 'key',            '#0891b2', 'moradia'),
      ('moradia-contas',       'Contas da casa',       'expense', 'plug',           '#0891b2', 'moradia'),
      ('moradia-itens',        'Móveis e utensílios',  'expense', 'sofa',           '#0891b2', 'moradia'),
      ('saude',                'Saúde',                'expense', 'heart-pulse',    '#dc2626', null),
      ('educacao',             'Educação',             'expense', 'graduation-cap', '#7c3aed', null),
      ('lazer',                'Lazer',                'expense', 'party-popper',   '#db2777', null),
      ('lazer-jogos',          'Jogos e apostas',      'expense', 'dices',          '#db2777', 'lazer'),
      ('lazer-viagens',        'Viagens e passeios',   'expense', 'plane',          '#db2777', 'lazer'),
      ('compras',              'Compras',              'expense', 'shopping-bag',   '#9333ea', null),
      ('servicos',             'Assinaturas e serviços','expense','repeat',         '#4f46e5', null),
      ('comunicacao',          'Telefone e internet',  'expense', 'wifi',           '#0d9488', null),
      ('tarifas',              'Tarifas e impostos',   'expense', 'receipt',        '#78716c', null),
      ('pessoal',              'Despesas pessoais',    'expense', 'user',           '#a16207', null),
      ('outras-despesas',      'Outras despesas',      'expense', 'circle',         '#64748b', null),
      ('salario',              'Salário',              'income',  'briefcase',      '#16a34a', null),
      ('renda-extra',          'Renda extra',          'income',  'sparkles',       '#16a34a', null),
      ('rendimentos',          'Rendimentos',          'income',  'trending-up',    '#16a34a', null),
      ('reembolsos',           'Reembolsos',           'income',  'undo-2',         '#16a34a', null),
      ('outras-receitas',      'Outras receitas',      'income',  'circle-plus',    '#16a34a', null)
    ) as t(slug, name, kind, icon, color, parent_slug)
  loop
    parent := null;
    if r.parent_slug is not null then
      select id into parent from public.categories where user_id = p_user and slug = r.parent_slug;
    end if;
    insert into public.categories (user_id, parent_id, kind, name, slug, icon, color)
    values (p_user, parent, r.kind, r.name, r.slug, r.icon, r.color)
    on conflict (user_id, slug) do nothing;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Novo usuário: valida convite, cria perfil e categorias.
-- O primeiro usuário do sistema não precisa de convite e vira administrador.
-- Qualquer outro cadastro sem convite válido é recusado aqui dentro do banco.
-- -----------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code  text := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');
  v_first boolean;
  v_inv   public.invites;
begin
  -- trava a tabela de perfis para evitar dois "primeiros usuários" simultâneos
  lock table public.profiles in share row exclusive mode;
  select not exists (select 1 from public.profiles) into v_first;

  if not v_first then
    if v_code is null then
      raise exception 'Cadastro somente por convite.' using errcode = 'P0001';
    end if;

    select * into v_inv from public.invites where code = v_code for update;
    if not found or v_inv.expires_at < now() or v_inv.uses >= v_inv.max_uses then
      raise exception 'Convite inválido ou expirado.' using errcode = 'P0001';
    end if;

    update public.invites set uses = uses + 1 where code = v_code;
  end if;

  insert into public.profiles (id, full_name, is_admin)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 120), ''), v_first);

  if not v_first then
    insert into public.invite_redemptions (invite_code, user_id) values (v_code, new.id);
  end if;

  perform public.seed_default_categories(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Funções chamadas pelo app
-- -----------------------------------------------------------------------------

-- Valida um convite antes do cadastro (mostra erro amigável sem expor a tabela).
create function public.check_invite(p_code text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.invites
    where code = trim(p_code) and expires_at > now() and uses < max_uses
  );
$$;

-- Cria um convite (somente administradores).
create function public.create_invite(p_max_uses int default 1, p_days int default 14, p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'Apenas administradores podem criar convites.' using errcode = '42501';
  end if;
  insert into public.invites (created_by, max_uses, expires_at, note)
  values (auth.uid(), greatest(1, least(p_max_uses, 50)),
          now() + make_interval(days => greatest(1, least(p_days, 90))), p_note)
  returning code into v_code;
  return v_code;
end $$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_invite(int, int, text) from public, anon;
grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.create_invite(int, int, text) to authenticated;

-- Saldo de cada conta (respeita RLS de quem consulta).
create view public.account_balances with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.initial_balance_cents
    + coalesce(sum(case when t.type in ('income', 'transfer_in') then t.amount_cents
                        else -t.amount_cents end)
               filter (where t.status = 'paid'), 0) as balance_cents
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.invites            enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.accounts           enable row level security;
alter table public.credit_cards       enable row level security;
alter table public.card_bills         enable row level security;
alter table public.categories         enable row level security;
alter table public.installments       enable row level security;
alter table public.recurrences        enable row level security;
alter table public.imports            enable row level security;
alter table public.transactions       enable row level security;
alter table public.budgets            enable row level security;
alter table public.category_rules     enable row level security;

-- Perfil: cada um lê e edita o próprio (sem poder se promover a admin).
create policy "perfil: ler o próprio" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Convites: administradores veem os que criaram; criação só pela função create_invite.
create policy "convites: admin vê os seus" on public.invites
  for select to authenticated using (created_by = (select auth.uid()));
create policy "convites: admin apaga os seus" on public.invites
  for delete to authenticated using (created_by = (select auth.uid()));

-- Tabelas do usuário: mesma regra para todas — só as próprias linhas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'credit_cards', 'card_bills', 'categories', 'installments',
    'recurrences', 'imports', 'transactions', 'budgets', 'category_rules'
  ] loop
    execute format(
      'create policy "dono: acesso total" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end $$;

-- Ninguém anônimo acessa tabelas.
revoke all on all tables in schema public from anon;
