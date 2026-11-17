-- Moloni credentials and tokens. Run once in the SQL editor after 0004.
-- Idempotent. Clients cannot read this table. Only the Edge Function (service role) can.

create table if not exists public.moloni_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  developer_id text not null,
  client_secret text not null,
  username text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  moloni_company_id text,
  moloni_company_name text,
  series_fatura text,
  series_fatura_recibo text,
  series_orcamento text,
  tax_id text,
  payment_map jsonb not null default '{}'::jsonb,
  issue_as text not null default 'fatura' check (issue_as in ('fatura', 'fatura_recibo')),
  test_mode boolean not null default true,
  product_id text,
  updated_at timestamptz not null default now()
);

alter table public.moloni_connections enable row level security;

revoke all on table public.moloni_connections from public, anon, authenticated;

notify pgrst, 'reload schema';
