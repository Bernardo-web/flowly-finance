# Flowly

Organizador financeiro pessoal, por convite, instalável no celular.
Next.js 15 + TypeScript + Tailwind, Supabase (PostgreSQL com Row Level Security), hospedado na Vercel.

## O que o app faz (v1)

- **Contas e carteiras** com saldo calculado; transferências entre contas.
- **Lançamentos** de receita e despesa, pendentes ou pagos, com filtros, busca e navegação por mês.
- **Cartões de crédito**: fatura calculada pelo dia de fechamento, compras parceladas (até 24x)
  divididas nas faturas seguintes, limite disponível e pagamento de fatura (sai da conta sem
  contar como despesa duas vezes).
- **Recorrências**: vários dias por mês (ex.: salário dia 15 e 30), dia inexistente cai no último
  dia do mês, fim de semana antecipa/adia/mantém, valor fixo (entra pago) ou variável (entra
  pendente para confirmar). Lançadas sozinhas quando você abre o app.
- **Orçamentos** por categoria e mês, com aviso a partir de 80% e de 100%, e opção de repetir os
  limites do mês anterior.
- **Importação de extrato**: CSV do Banco do Brasil (já categorizado pelo banco), OFX de qualquer
  banco (duplicados detectados pelo identificador da transação) e CSV de outros bancos com
  reconhecimento automático das colunas ou indicação manual. Prévia editável, Rende Fácil e
  estornos desmarcados, duplicados marcados, categoria aprendida por descrição e botão de desfazer.
  O arquivo é lido no aparelho; só as linhas confirmadas são enviadas.
- **Painel**: saldo, receitas e despesas do mês, para onde foi o dinheiro, alertas de orçamento e
  os próximos 30 dias (pendentes, recorrências e faturas a vencer).
- **Categorias** com subcategorias, cores e regras aprendidas (editáveis).
- **Convites** (administrador), **configurações** (perfil, tema claro/escuro, exportar dados em
  CSV e JSON, excluir conta) e **página de privacidade**.

## Segurança

- **Row Level Security** em todas as tabelas: o banco só devolve as linhas do usuário logado.
- **Chaves estrangeiras compostas** `(id, user_id)`: ninguém liga um lançamento à conta ou ao
  cartão de outra pessoa, nem chamando a API diretamente.
- **Operações atômicas no banco** (importação, compra parcelada, pagamento de fatura,
  recorrências): ou tudo é salvo, ou nada.
- **Convite validado dentro do banco** no cadastro. O primeiro usuário vira administrador.
- Usuário não consegue se promover a administrador (permissão por coluna).
- Agência e número da conta do extrato são descartados na leitura e nunca são salvos.
- Exportação CSV protegida contra injeção de fórmulas no Excel.

## Como colocar no ar

### 1. Supabase (banco e login)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região **South America (São Paulo)**).
2. Em **SQL Editor > New query**, rode os arquivos de `supabase/migrations` **em ordem**, um de
   cada vez (colar o conteúdo e clicar em **Run**): `0001_schema.sql`, `0002_import.sql`,
   `0003_cards_recurrences.sql`. Cada arquivo roda uma única vez.
3. Em **Authentication > URL Configuration**:
   - *Site URL*: o endereço do app (no começo, `http://localhost:3000`; depois, o da Vercel).
   - *Redirect URLs*: adicione `http://localhost:3000/**` e o endereço da Vercel com `/**`.
4. Em **Authentication > Emails**, ajuste os links dos modelos:
   - *Confirm signup*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nova-senha`
5. Em **Project Settings > API**, copie a *Project URL* e a chave *anon public*.

### 2. Rodar no computador

Precisa do [Node.js](https://nodejs.org) 22.18 ou mais novo.

```bash
npm install
cp .env.example .env.local   # e preencha com os dados do passo 1.5
npm run dev                  # abre em http://localhost:3000
```

**Crie a sua conta primeiro:** abra `/cadastro` e cadastre-se sem código. Como você é o primeiro
usuário, vira administrador. A partir daí, o cadastro só funciona com convite: gere os links
na tela **Convites**.

**Primeiros passos no app:** cadastre suas contas, depois os cartões, cadastre salário e contas
fixas em **Recorrências** e importe o extrato.

### 3. Publicar na Vercel

1. Suba o projeto para o GitHub (repositório `flowly-finance`).
2. Em [vercel.com](https://vercel.com), **Add New > Project** e importe o repositório.
3. Em *Environment Variables*, cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_SITE_URL` (o endereço da Vercel) e um `CRON_SECRET` qualquer, longo e aleatório.
4. Deploy. Depois, atualize a *Site URL* e as *Redirect URLs* do Supabase com o endereço final.

O `vercel.json` agenda uma chamada diária a `/api/keepalive`, para o plano gratuito do Supabase
não pausar o projeto por inatividade.

### Instalar no celular

Abra o endereço do app no navegador do celular e use **Adicionar à tela inicial**.

## Estrutura

```
src/
  app/(auth)/          entrar, cadastro por convite, recuperar e nova senha
  app/(app)/           área logada: painel, lançamentos, contas, cartões, orçamentos,
                       recorrências, importar, categorias, convites, configurações
  app/api/             exportar dados, keepalive
  app/privacidade/     política de privacidade
  lib/import/          leitores de extrato (BB CSV, OFX, CSV genérico), duplicados e sugestões
  lib/cards.ts         fatura de cada compra e divisão de parcelas
  lib/recurrence.ts    datas de recorrência com regra de fim de semana
  lib/money/           dinheiro sempre em centavos (inteiro)
  lib/supabase/        clientes do Supabase e proteção de rotas
supabase/
  migrations/          schema do banco (rodar no Supabase, em ordem)
  tests/               testes de segurança e das funções do banco
test/                  testes das regras (importação, cartões, recorrências, validação)
```

## Testes

```bash
npm test                                      # regras do app (usa extratos de exemplo anônimos)
BB_CSV_REAL=/caminho/extrato.csv npm test     # também testa com um extrato real, só na sua máquina
npm run typecheck && npm run lint && npm run build
```

Testes do banco (precisam de um PostgreSQL local, não do Supabase):

```bash
createdb flowly_test
psql -d flowly_test -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -d flowly_test -f "$f"; done
psql -d flowly_test -f supabase/tests/rls_test.sql
psql -d flowly_test -f supabase/tests/import_test.sql
psql -d flowly_test -f supabase/tests/cards_test.sql
```

Extratos reais nunca devem ir para o repositório (o `.gitignore` já bloqueia os padrões comuns).

## Limitações conhecidas

- Feriados não são considerados na regra de fim de semana das recorrências.
- Recorrências são lançadas quando alguém abre o painel, os lançamentos ou a tela de recorrências.
- Importação de extrato vai para contas; faturas de cartão ainda são lançadas à mão.
