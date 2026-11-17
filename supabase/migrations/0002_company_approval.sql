-- OficinaPlan company approval. Safe to re-run after 0001_init.sql.
-- Pending and suspended companies cannot read or write tenant data.
-- Platform admins can list companies and change status, and nothing else.

alter table public.companies add column if not exists status text;
alter table public.companies add column if not exists approved_at timestamptz;
alter table public.companies add column if not exists approved_by uuid;
alter table public.companies add column if not exists notes text;

update public.companies
set status = 'pending'
where status is null or status not in ('pending', 'active', 'suspended');

update public.companies
set status = 'active',
    approved_at = coalesce(approved_at, now())
where name ilike '%hyperion%';

alter table public.companies alter column status set default 'pending';
alter table public.companies alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_status_check' and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_status_check check (status in ('pending', 'active', 'suspended'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_approved_by_fkey' and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_approved_by_fkey foreign key (approved_by) references auth.users (id) on delete set null;
  end if;
end $$;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- Make an email a platform admin after that person has signed up:
-- insert into public.platform_admins (user_id)
-- select id from auth.users where email = 'angelo@example.com'
-- on conflict (user_id) do nothing;

create or replace function public.current_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.company_id
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
    and c.status = 'active';
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
  insert into public.companies (name, status)
  values (coalesce(company_name, 'A minha oficina'), 'pending')
  returning id into cid;
  insert into public.memberships (user_id, company_id, role)
  values (new.id, cid, 'owner');
  return new;
end;
$$;

create or replace function public.my_account()
returns table (
  company_id uuid,
  company_name text,
  role text,
  status text,
  platform_admin boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.memberships where user_id = auth.uid()) then
    return query
    select c.id, c.name, m.role, c.status, public.is_platform_admin()
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.user_id = auth.uid()
    order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at
    limit 1;
  else
    return query
    select null::uuid, null::text, null::text, null::text, public.is_platform_admin();
  end if;
end;
$$;

create or replace function public.admin_list_companies()
returns table (
  id uuid,
  name text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  notes text,
  owner_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administração';
  end if;
  return query
  select
    c.id,
    c.name,
    c.status,
    c.created_at,
    c.approved_at,
    c.notes,
    (
      select u.email::text
      from public.memberships m
      join auth.users u on u.id = m.user_id
      where m.company_id = c.id and m.role = 'owner'
      order by m.created_at
      limit 1
    )
  from public.companies c
  order by c.created_at desc;
end;
$$;

create or replace function public.admin_set_company_status(p_company_id uuid, p_status text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administração';
  end if;
  if p_status not in ('pending', 'active', 'suspended') then
    raise exception 'Estado inválido';
  end if;
  update public.companies
  set status = p_status,
      notes = coalesce(p_notes, notes),
      approved_at = case when p_status = 'active' then now() else approved_at end,
      approved_by = case when p_status = 'active' then auth.uid() else approved_by end
  where id = p_company_id;
  if not found then
    raise exception 'Empresa não encontrada';
  end if;
end;
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.current_company_ids() to authenticated;
grant execute on function public.my_account() to authenticated;
grant execute on function public.admin_list_companies() to authenticated;
grant execute on function public.admin_set_company_status(uuid, text, text) to authenticated;

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
  join public.companies c on c.id = m.company_id and c.status = 'active'
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'A oficina ainda não está ativa';
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
  join public.companies c on c.id = m.company_id and c.status = 'active'
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'A oficina ainda não está ativa';
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
  join public.companies c on c.id = m.company_id and c.status = 'active'
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'A oficina ainda não está ativa';
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


grant execute on function public.assign_document_number(text) to authenticated;
grant execute on function public.save_company_state(jsonb) to authenticated;
grant execute on function public.save_company_settings(jsonb) to authenticated;
