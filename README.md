# Flowly

Organizador financeiro pessoal, por convite, instalável no celular.
Next.js + TypeScript + Supabase (PostgreSQL com Row Level Security), hospedado na Vercel.

## Status

**Fase 1 (pronta):** estrutura do projeto, banco de dados completo com segurança, login e
cadastro por convite, recuperação de senha, painel inicial, tela de convites e o leitor do
extrato CSV do Banco do Brasil (testado com um extrato real de 539 linhas).

**Próxima fase:** contas, lançamentos, categorias e a tela de importação de extrato.

## Estrutura

```
src/
  app/(auth)/        entrar, cadastro (por convite), recuperar e nova senha
  app/(app)/         área logada: painel e convites (admin)
  app/auth/confirm/  destino dos links de e-mail
  app/api/keepalive/ mantém o Supabase gratuito acordado
  lib/import/        leitor do extrato do BB, normalização, sugestão de categoria e duplicados
  lib/money/         dinheiro sempre em centavos (inteiro)
  lib/supabase/      clientes do Supabase e proteção de rotas
supabase/
  migrations/        schema do banco (rodar no Supabase)
  tests/             testes de segurança do banco
test/                testes do importador
```

## Segurança, em resumo

- **Row Level Security** em todas as tabelas: o próprio banco só devolve as linhas do usuário logado.
- **Chaves estrangeiras compostas** `(id, user_id)`: ninguém consegue ligar um lançamento à conta de outra pessoa, nem chamando a API diretamente.
- **Convite validado dentro do banco**, no momento do cadastro. O primeiro usuário vira administrador; os demais só entram com um convite válido.
- Usuário não consegue se promover a administrador (permissão por coluna).
- Agência e número da conta do extrato são descartados na leitura e nunca são salvos.

## Como colocar no ar

### 1. Supabase (banco e login)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região **South America (São Paulo)**).
2. Em **SQL Editor > New query**, cole todo o conteúdo de `supabase/migrations/0001_schema.sql` e clique em **Run**.
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

## Testes

```bash
npm test                                      # importador do BB (usa um extrato de exemplo anônimo)
BB_CSV_REAL=/caminho/extrato.csv npm test     # também testa com um extrato real, só na sua máquina
```

Testes de segurança do banco (precisam de um PostgreSQL local, não do Supabase):

```bash
createdb flowly_test
psql -d flowly_test -f supabase/tests/supabase_stub.sql
psql -d flowly_test -f supabase/migrations/0001_schema.sql
psql -d flowly_test -f supabase/tests/rls_test.sql
```

Extratos reais nunca devem ir para o repositório (o `.gitignore` já bloqueia os padrões comuns).
