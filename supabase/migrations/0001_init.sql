-- OficinaPlan initial schema. Safe to run more than once.
-- Apply in the Supabase SQL editor or with the Supabase connector.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'tecnico')),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

create or replace function public.current_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.memberships where user_id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  company_name text;
begin
  if exists (select 1 from public.memberships where user_id = new.id) then
    return new;
  end if;
  company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  insert into public.companies (name)
  values (coalesce(company_name, 'A minha oficina'))
  returning id into cid;
  insert into public.memberships (user_id, company_id, role)
  values (new.id, cid, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.clients (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  name text not null,
  nif text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.vehicles (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  client_id text,
  plate text not null default '',
  brand text not null default '',
  model text not null default '',
  version text not null default '',
  year int,
  vin text not null default '',
  engine text not null default '',
  engine_code text not null default '',
  oil text not null default '',
  next_inspection text not null default '',
  next_service text not null default '',
  km int not null default 0,
  fuel text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.articles (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  ref text not null default '',
  description text not null default '',
  family text not null default '',
  cost_price numeric not null default 0,
  last_cost numeric,
  margin_percent numeric not null default 0,
  vat_rate numeric not null default 23,
  stock_qty numeric not null default 0,
  min_stock numeric not null default 0,
  is_oil boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.suppliers (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  name text not null,
  nif text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.orders (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  number text not null,
  client_id text,
  vehicle_id text,
  date_in timestamptz not null,
  date_out timestamptz,
  km int not null default 0,
  km_out int,
  problem text not null default '',
  status text not null default 'aberta',
  approval text not null default 'aguarda',
  approval_at timestamptz,
  notes text not null default '',
  invoice_number text,
  invoice_provider text,
  invoice_issued_at timestamptz,
  invoice_simulated boolean not null default false,
  invoice_url text,
  payment_method text,
  paid_at timestamptz,
  quote_number text,
  quote_url text,
  quote_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.quotes (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  number text not null,
  client_id text,
  vehicle_id text,
  date timestamptz not null,
  valid_until timestamptz,
  km int not null default 0,
  problem text not null default '',
  status text not null default 'aberto',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.doc_lines (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  order_id text,
  quote_id text,
  kind text not null,
  description text not null default '',
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  unit_cost numeric not null default 0,
  discount_percent numeric not null default 0,
  vat_rate numeric not null default 23,
  internal_note text not null default '',
  article_id text,
  ref text not null default '',
  position int not null default 0,
  stock_entry jsonb,
  primary key (company_id, id)
);

create table if not exists public.purchases (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  date timestamptz not null,
  supplier_id text,
  document_type text not null default '',
  invoice_number text not null default '',
  payment_method text not null default '',
  voided boolean not null default false,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.purchase_lines (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  purchase_id text not null,
  article_id text,
  tipologia text not null default '',
  ref text not null default '',
  description text not null default '',
  quantity numeric not null default 0,
  cost numeric not null default 0,
  vat_rate numeric not null default 23,
  margin numeric not null default 0,
  position int not null default 0,
  stock_before numeric not null default 0,
  cost_before numeric not null default 0,
  primary key (company_id, id)
);

create table if not exists public.appointments (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  client_id text,
  vehicle_id text,
  title text not null default '',
  notes text not null default '',
  order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.invoice_logs (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  order_id text,
  provider_id text not null default '',
  provider_label text not null default '',
  simulated boolean not null default true,
  document_number text not null default '',
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (company_id, id)
);

create table if not exists public.staff (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  name text not null,
  login text not null default '',
  email text not null default '',
  role text not null default 'tecnico',
  active boolean not null default true,
  technician boolean not null default false,
  clocks_in boolean not null default false,
  pin text not null default '',
  primary key (company_id, id)
);

create table if not exists public.assignments (
  company_id uuid not null references public.companies (id) on delete cascade,
  order_id text not null,
  user_id text not null,
  position int not null default 0,
  primary key (company_id, order_id)
);

create table if not exists public.work_logs (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  user_id text not null,
  kind text not null,
  target_id text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  primary key (company_id, id)
);

create table if not exists public.punches (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  user_id text not null,
  in_at timestamptz not null,
  out_at timestamptz,
  primary key (company_id, id)
);

create table if not exists public.internal_services (
  company_id uuid not null references public.companies (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  position int not null default 0,
  primary key (company_id, id)
);

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  company jsonb not null default '{}'::jsonb,
  prices jsonb not null default '{}'::jsonb,
  users jsonb not null default '[]'::jsonb,
  permissions jsonb not null default '{}'::jsonb,
  billing jsonb not null default '{}'::jsonb,
  plate_lookup jsonb not null default '{}'::jsonb,
  service_types jsonb not null default '[]'::jsonb,
  internal_services jsonb not null default '[]'::jsonb,
  ecolub text,
  assignments jsonb not null default '[]'::jsonb,
  work_logs jsonb not null default '[]'::jsonb,
  punches jsonb not null default '[]'::jsonb,
  symptoms jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.document_counters (
  company_id uuid not null references public.companies (id) on delete cascade,
  series text not null,
  year int not null,
  last_value int not null default 0,
  primary key (company_id, series, year)
);

create index if not exists orders_company_number_idx on public.orders (company_id, number);
create index if not exists clients_company_name_idx on public.clients (company_id, name);

create or replace function public.assign_document_number(p_series text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  yr int;
  n int;
  series text := upper(trim(p_series));
begin
  select m.company_id into cid
  from public.memberships m
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'Sem empresa para este utilizador';
  end if;
  if series not in ('OR', 'ORC', 'ORCDOC', 'FT') then
    raise exception 'Série inválida';
  end if;
  yr := extract(year from (now() at time zone 'Europe/Lisbon'))::int;
  insert into public.document_counters as c (company_id, series, year, last_value)
  values (cid, series, yr, 1)
  on conflict (company_id, series, year)
  do update set last_value = c.last_value + 1
  returning last_value into n;
  if series = 'OR' then
    return 'OR-' || yr::text || '-' || lpad(n::text, 4, '0');
  elsif series = 'ORC' then
    return 'ORC-' || yr::text || '-' || lpad(n::text, 4, '0');
  elsif series = 'ORCDOC' then
    return 'ORC A/' || yr::text || '/' || lpad(n::text, 4, '0');
  else
    return 'FT A/' || yr::text || '/' || lpad(n::text, 4, '0');
  end if;
end;
$$;

create or replace function public.save_company_state(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select m.company_id into cid
  from public.memberships m
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'Sem empresa para este utilizador';
  end if;

  delete from public.invoice_logs where company_id = cid;
  delete from public.doc_lines where company_id = cid;
  delete from public.purchase_lines where company_id = cid;
  delete from public.appointments where company_id = cid;
  delete from public.orders where company_id = cid;
  delete from public.quotes where company_id = cid;
  delete from public.purchases where company_id = cid;
  delete from public.vehicles where company_id = cid;
  delete from public.clients where company_id = cid;
  delete from public.articles where company_id = cid;
  delete from public.suppliers where company_id = cid;
  delete from public.assignments where company_id = cid;
  delete from public.work_logs where company_id = cid;
  delete from public.punches where company_id = cid;
  delete from public.internal_services where company_id = cid;
  delete from public.staff where company_id = cid;

  insert into public.clients (company_id, id, name, nif, phone, email, address, postal_code, city, notes, created_at, updated_at)
  select cid, x.id, coalesce(x.name, ''), coalesce(x.nif, ''), coalesce(x.phone, ''), coalesce(x.email, ''), coalesce(x.address, ''), coalesce(x."postalCode", ''), coalesce(x.city, ''), coalesce(x.notes, ''), coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'clients', '[]'::jsonb)) as x(id text, name text, nif text, phone text, email text, address text, "postalCode" text, city text, notes text, "createdAt" text, "updatedAt" text);

  insert into public.vehicles (company_id, id, client_id, plate, brand, model, version, year, vin, engine, engine_code, oil, next_inspection, next_service, km, fuel, created_at, updated_at)
  select cid, x.id, x."clientId", coalesce(x.plate, ''), coalesce(x.brand, ''), coalesce(x.model, ''), coalesce(x.version, ''), x.year, coalesce(x.vin, ''), coalesce(x.engine, ''), coalesce(x."engineCode", ''), coalesce(x.oil, ''), coalesce(x."nextInspection", ''), coalesce(x."nextService", ''), coalesce(x.km, 0), coalesce(x.fuel, ''), coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'vehicles', '[]'::jsonb)) as x(id text, "clientId" text, plate text, brand text, model text, version text, year int, vin text, engine text, "engineCode" text, oil text, "nextInspection" text, "nextService" text, km int, fuel text, "createdAt" text, "updatedAt" text);

  insert into public.articles (company_id, id, ref, description, family, cost_price, last_cost, margin_percent, vat_rate, stock_qty, min_stock, is_oil, active, created_at, updated_at)
  select cid, x.id, coalesce(x.ref, ''), coalesce(x.description, ''), coalesce(x.family, ''), coalesce(x."costPrice", 0), x."lastCost", coalesce(x."marginPercent", 0), coalesce(x."vatRate", 23), coalesce(x."stockQty", 0), coalesce(x."minStock", 0), coalesce(x."isOil", false), coalesce(x.active, true), coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'articles', '[]'::jsonb)) as x(id text, ref text, description text, family text, "costPrice" numeric, "lastCost" numeric, "marginPercent" numeric, "vatRate" numeric, "stockQty" numeric, "minStock" numeric, "isOil" boolean, active boolean, "createdAt" text, "updatedAt" text);

  insert into public.suppliers (company_id, id, name, nif, phone, email, address, notes, created_at, updated_at)
  select cid, x.id, coalesce(x.name, ''), coalesce(x.nif, ''), coalesce(x.phone, ''), coalesce(x.email, ''), coalesce(x.address, ''), coalesce(x.notes, ''), coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'suppliers', '[]'::jsonb)) as x(id text, name text, nif text, phone text, email text, address text, notes text, "createdAt" text, "updatedAt" text);

  insert into public.orders (company_id, id, number, client_id, vehicle_id, date_in, date_out, km, km_out, problem, status, approval, approval_at, notes, invoice_number, invoice_provider, invoice_issued_at, invoice_simulated, invoice_url, payment_method, paid_at, quote_number, quote_url, quote_id, created_at, updated_at)
  select cid, x.id, coalesce(x.number, ''), x."clientId", x."vehicleId", coalesce(x."dateIn"::timestamptz, now()), x."dateOut"::timestamptz, coalesce(x.km, 0), x."kmOut", coalesce(x.problem, ''), coalesce(x.status, 'aberta'), coalesce(x.approval, 'aguarda'), x."approvalAt"::timestamptz, coalesce(x.notes, ''), x."invoiceNumber", x."invoiceProvider", x."invoiceIssuedAt"::timestamptz, coalesce(x."invoiceSimulated", false), x."invoiceUrl", x."paymentMethod", x."paidAt"::timestamptz, x."quoteNumber", x."quoteUrl", x."quoteId", coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'orders', '[]'::jsonb)) as x(id text, number text, "clientId" text, "vehicleId" text, "dateIn" text, "dateOut" text, km int, "kmOut" int, problem text, status text, approval text, "approvalAt" text, notes text, "invoiceNumber" text, "invoiceProvider" text, "invoiceIssuedAt" text, "invoiceSimulated" boolean, "invoiceUrl" text, "paymentMethod" text, "paidAt" text, "quoteNumber" text, "quoteUrl" text, "quoteId" text, "createdAt" text, "updatedAt" text);

  insert into public.quotes (company_id, id, number, client_id, vehicle_id, date, valid_until, km, problem, status, notes, created_at, updated_at)
  select cid, x.id, coalesce(x.number, ''), x."clientId", x."vehicleId", coalesce(x.date::timestamptz, now()), x."validUntil"::timestamptz, coalesce(x.km, 0), coalesce(x.problem, ''), coalesce(x.status, 'aberto'), coalesce(x.notes, ''), coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'quotes', '[]'::jsonb)) as x(id text, number text, "clientId" text, "vehicleId" text, date text, "validUntil" text, km int, problem text, status text, notes text, "createdAt" text, "updatedAt" text);

  insert into public.doc_lines (company_id, id, order_id, quote_id, kind, description, quantity, unit_price, unit_cost, discount_percent, vat_rate, internal_note, article_id, ref, position, stock_entry)
  select cid, x.id, x."orderId", x."quoteId", coalesce(x.kind, 'peca'), coalesce(x.description, ''), coalesce(x.quantity, 0), coalesce(x."unitPrice", 0), coalesce(x."unitCost", 0), coalesce(x."discountPercent", 0), coalesce(x."vatRate", 23), coalesce(x."internalNote", ''), x."articleId", coalesce(x.ref, ''), coalesce(x.position, 0), x."stockEntry"
  from jsonb_to_recordset(coalesce(payload->'lines', '[]'::jsonb)) as x(id text, "orderId" text, "quoteId" text, kind text, description text, quantity numeric, "unitPrice" numeric, "unitCost" numeric, "discountPercent" numeric, "vatRate" numeric, "internalNote" text, "articleId" text, ref text, position int, "stockEntry" jsonb);

  insert into public.purchases (company_id, id, date, supplier_id, document_type, invoice_number, payment_method, voided, voided_at, created_at)
  select cid, x.id, coalesce(x.date::timestamptz, now()), x."supplierId", coalesce(x."documentType", ''), coalesce(x."invoiceNumber", ''), coalesce(x."paymentMethod", ''), coalesce(x.voided, false), x."voidedAt"::timestamptz, coalesce(x."createdAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'purchases', '[]'::jsonb)) as x(id text, date text, "supplierId" text, "documentType" text, "invoiceNumber" text, "paymentMethod" text, voided boolean, "voidedAt" text, "createdAt" text);

  insert into public.purchase_lines (company_id, id, purchase_id, article_id, tipologia, ref, description, quantity, cost, vat_rate, margin, position, stock_before, cost_before)
  select cid, x.id, x."purchaseId", x."articleId", coalesce(x.tipologia, ''), coalesce(x.ref, ''), coalesce(x.description, ''), coalesce(x.quantity, 0), coalesce(x.cost, 0), coalesce(x."vatRate", 23), coalesce(x.margin, 0), coalesce(x.position, 0), coalesce(x."stockBefore", 0), coalesce(x."costBefore", 0)
  from jsonb_to_recordset(coalesce(payload->'purchaseLines', '[]'::jsonb)) as x(id text, "purchaseId" text, "articleId" text, tipologia text, ref text, description text, quantity numeric, cost numeric, "vatRate" numeric, margin numeric, position int, "stockBefore" numeric, "costBefore" numeric);

  insert into public.appointments (company_id, id, starts_at, ends_at, client_id, vehicle_id, title, notes, order_id, created_at, updated_at)
  select cid, x.id, x."startsAt"::timestamptz, x."endsAt"::timestamptz, x."clientId", x."vehicleId", coalesce(x.title, ''), coalesce(x.notes, ''), x."orderId", coalesce(x."createdAt"::timestamptz, now()), coalesce(x."updatedAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'appointments', '[]'::jsonb)) as x(id text, "startsAt" text, "endsAt" text, "clientId" text, "vehicleId" text, title text, notes text, "orderId" text, "createdAt" text, "updatedAt" text);

  insert into public.invoice_logs (company_id, id, order_id, provider_id, provider_label, simulated, document_number, request_json, response_json, created_at)
  select cid, x.id, x."orderId", coalesce(x."providerId", ''), coalesce(x."providerLabel", ''), coalesce(x.simulated, true), coalesce(x."documentNumber", ''), case when coalesce(x."requestJson", '') = '' then '{}'::jsonb else x."requestJson"::jsonb end, case when coalesce(x."responseJson", '') = '' then '{}'::jsonb else x."responseJson"::jsonb end, coalesce(x."createdAt"::timestamptz, now())
  from jsonb_to_recordset(coalesce(payload->'invoiceLogs', '[]'::jsonb)) as x(id text, "orderId" text, "providerId" text, "providerLabel" text, simulated boolean, "documentNumber" text, "requestJson" text, "responseJson" text, "createdAt" text);

  insert into public.staff (company_id, id, name, login, email, role, active, technician, clocks_in, pin)
  select cid, x.id, coalesce(x.name, ''), coalesce(x.login, ''), coalesce(x.email, ''), coalesce(x.role, 'tecnico'), coalesce(x.active, true), coalesce(x.technician, false), coalesce(x."clocksIn", false), coalesce(x.pin, '')
  from jsonb_to_recordset(coalesce(payload#>'{settings,users}', '[]'::jsonb)) as x(id text, name text, login text, email text, role text, active boolean, technician boolean, "clocksIn" boolean, pin text);

  insert into public.assignments (company_id, order_id, user_id, position)
  select cid, x."orderId", x."userId", coalesce(x.position, 0)
  from jsonb_to_recordset(coalesce(payload#>'{settings,assignments}', '[]'::jsonb)) as x("orderId" text, "userId" text, position int)
  where x."orderId" is not null;

  insert into public.work_logs (company_id, id, user_id, kind, target_id, started_at, ended_at)
  select cid, x.id, x."userId", coalesce(x.kind, 'obra'), coalesce(x."targetId", ''), x."startedAt"::timestamptz, nullif(x."endedAt", '')::timestamptz
  from jsonb_to_recordset(coalesce(payload#>'{settings,workLogs}', '[]'::jsonb)) as x(id text, "userId" text, kind text, "targetId" text, "startedAt" text, "endedAt" text);

  insert into public.punches (company_id, id, user_id, in_at, out_at)
  select cid, x.id, x."userId", x."inAt"::timestamptz, nullif(x."outAt", '')::timestamptz
  from jsonb_to_recordset(coalesce(payload#>'{settings,punches}', '[]'::jsonb)) as x(id text, "userId" text, "inAt" text, "outAt" text);

  insert into public.internal_services (company_id, id, name, active, position)
  select cid, x.id, coalesce(x.name, ''), coalesce(x.active, true), coalesce(x.position, 0)
  from jsonb_to_recordset(coalesce(payload#>'{settings,internalServices}', '[]'::jsonb)) as x(id text, name text, active boolean, position int);

  insert into public.company_settings as s (
    company_id, company, prices, users, permissions, billing, plate_lookup, service_types, internal_services, ecolub, assignments, work_logs, punches, symptoms, updated_at
  ) values (
    cid,
    coalesce(payload#>'{settings,company}', '{}'::jsonb),
    coalesce(payload#>'{settings,prices}', '{}'::jsonb),
    coalesce(payload#>'{settings,users}', '[]'::jsonb),
    coalesce(payload#>'{settings,permissions}', '{}'::jsonb),
    coalesce(payload#>'{settings,billing}', '{}'::jsonb),
    coalesce(payload#>'{settings,plateLookup}', '{}'::jsonb),
    coalesce(payload#>'{settings,serviceTypes}', '[]'::jsonb),
    coalesce(payload#>'{settings,internalServices}', '[]'::jsonb),
    payload#>>'{settings,ecolub}',
    coalesce(payload#>'{settings,assignments}', '[]'::jsonb),
    coalesce(payload#>'{settings,workLogs}', '[]'::jsonb),
    coalesce(payload#>'{settings,punches}', '[]'::jsonb),
    coalesce(payload#>'{settings,symptoms}', '{}'::jsonb),
    now()
  )
  on conflict (company_id) do update set
    company = excluded.company,
    prices = excluded.prices,
    users = excluded.users,
    permissions = excluded.permissions,
    billing = excluded.billing,
    plate_lookup = excluded.plate_lookup,
    service_types = excluded.service_types,
    internal_services = excluded.internal_services,
    ecolub = excluded.ecolub,
    assignments = excluded.assignments,
    work_logs = excluded.work_logs,
    punches = excluded.punches,
    symptoms = excluded.symptoms,
    updated_at = now();
end;
$$;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.vehicles enable row level security;
alter table public.articles enable row level security;
alter table public.suppliers enable row level security;
alter table public.orders enable row level security;
alter table public.quotes enable row level security;
alter table public.doc_lines enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.appointments enable row level security;
alter table public.invoice_logs enable row level security;
alter table public.staff enable row level security;
alter table public.assignments enable row level security;
alter table public.work_logs enable row level security;
alter table public.punches enable row level security;
alter table public.internal_services enable row level security;
alter table public.company_settings enable row level security;
alter table public.document_counters enable row level security;

drop policy if exists companies_member on public.companies;
create policy companies_member on public.companies for select to authenticated
  using (id in (select public.current_company_ids()));

drop policy if exists memberships_member on public.memberships;
create policy memberships_member on public.memberships for select to authenticated
  using (user_id = auth.uid() or company_id in (select public.current_company_ids()));

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clients','vehicles','articles','suppliers','orders','quotes','doc_lines','purchases','purchase_lines',
    'appointments','invoice_logs','staff','assignments','work_logs','punches','internal_services'
  ]
  loop
    execute format('drop policy if exists %I_member on public.%I', tbl, tbl);
    execute format(
      'create policy %I_member on public.%I for all to authenticated using (company_id in (select public.current_company_ids())) with check (company_id in (select public.current_company_ids()))',
      tbl, tbl
    );
  end loop;
end $$;

drop policy if exists company_settings_member on public.company_settings;
create policy company_settings_member on public.company_settings for all to authenticated
  using (company_id in (select public.current_company_ids()))
  with check (company_id in (select public.current_company_ids()));

grant usage on schema public to authenticated;
grant select on public.companies to authenticated;
grant select on public.memberships to authenticated;
grant select, insert, update, delete on
  public.clients, public.vehicles, public.articles, public.suppliers, public.orders, public.quotes,
  public.doc_lines, public.purchases, public.purchase_lines, public.appointments, public.invoice_logs,
  public.staff, public.assignments, public.work_logs, public.punches, public.internal_services, public.company_settings
  to authenticated;
grant execute on function public.current_company_ids() to authenticated;
grant execute on function public.assign_document_number(text) to authenticated;
create or replace function public.save_company_settings(settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
begin
  select m.company_id into cid
  from public.memberships m
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'Sem empresa para este utilizador';
  end if;
  delete from public.assignments where company_id = cid;
  delete from public.work_logs where company_id = cid;
  delete from public.punches where company_id = cid;
  delete from public.internal_services where company_id = cid;
  delete from public.staff where company_id = cid;
  insert into public.staff (company_id, id, name, login, email, role, active, technician, clocks_in, pin)
  select cid, x.id, coalesce(x.name, ''), coalesce(x.login, ''), coalesce(x.email, ''), coalesce(x.role, 'tecnico'), coalesce(x.active, true), coalesce(x.technician, false), coalesce(x."clocksIn", false), coalesce(x.pin, '')
  from jsonb_to_recordset(coalesce(settings->'users', '[]'::jsonb)) as x(id text, name text, login text, email text, role text, active boolean, technician boolean, "clocksIn" boolean, pin text);
  insert into public.assignments (company_id, order_id, user_id, position)
  select cid, x."orderId", x."userId", coalesce(x.position, 0)
  from jsonb_to_recordset(coalesce(settings->'assignments', '[]'::jsonb)) as x("orderId" text, "userId" text, position int)
  where x."orderId" is not null;
  insert into public.work_logs (company_id, id, user_id, kind, target_id, started_at, ended_at)
  select cid, x.id, x."userId", coalesce(x.kind, 'obra'), coalesce(x."targetId", ''), x."startedAt"::timestamptz, nullif(x."endedAt", '')::timestamptz
  from jsonb_to_recordset(coalesce(settings->'workLogs', '[]'::jsonb)) as x(id text, "userId" text, kind text, "targetId" text, "startedAt" text, "endedAt" text);
  insert into public.punches (company_id, id, user_id, in_at, out_at)
  select cid, x.id, x."userId", x."inAt"::timestamptz, nullif(x."outAt", '')::timestamptz
  from jsonb_to_recordset(coalesce(settings->'punches', '[]'::jsonb)) as x(id text, "userId" text, "inAt" text, "outAt" text);
  insert into public.internal_services (company_id, id, name, active, position)
  select cid, coalesce(x.id, gen_random_uuid()::text), coalesce(x.name, ''), coalesce(x.active, true), coalesce(x.position, ordinality - 1)
  from jsonb_array_elements(coalesce(settings->'internalServices', '[]'::jsonb)) with ordinality as item(value, ordinality)
  cross join lateral jsonb_to_record(item.value) as x(id text, name text, active boolean, position int);
  insert into public.company_settings as s (
    company_id, company, prices, users, permissions, billing, plate_lookup, service_types, internal_services, ecolub, assignments, work_logs, punches, symptoms, updated_at
  ) values (
    cid,
    coalesce(settings->'company', '{}'::jsonb),
    coalesce(settings->'prices', '{}'::jsonb),
    coalesce(settings->'users', '[]'::jsonb),
    coalesce(settings->'permissions', '{}'::jsonb),
    coalesce(settings->'billing', '{}'::jsonb),
    coalesce(settings->'plateLookup', '{}'::jsonb),
    coalesce(settings->'serviceTypes', '[]'::jsonb),
    coalesce(settings->'internalServices', '[]'::jsonb),
    settings->>'ecolub',
    coalesce(settings->'assignments', '[]'::jsonb),
    coalesce(settings->'workLogs', '[]'::jsonb),
    coalesce(settings->'punches', '[]'::jsonb),
    coalesce(settings->'symptoms', '{}'::jsonb),
    now()
  )
  on conflict (company_id) do update set
    company = excluded.company,
    prices = excluded.prices,
    users = excluded.users,
    permissions = excluded.permissions,
    billing = excluded.billing,
    plate_lookup = excluded.plate_lookup,
    service_types = excluded.service_types,
    internal_services = excluded.internal_services,
    ecolub = excluded.ecolub,
    assignments = excluded.assignments,
    work_logs = excluded.work_logs,
    punches = excluded.punches,
    symptoms = excluded.symptoms,
    updated_at = now();
end;
$$;

grant execute on function public.save_company_settings(jsonb) to authenticated;
grant execute on function public.save_company_state(jsonb) to authenticated;
