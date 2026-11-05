-- Simula o mínimo do Supabase (schema auth, papéis e auth.uid()) para testar
-- as migrações num PostgreSQL comum. NÃO rode isto no Supabase de verdade.
create role anon nologin;
create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
