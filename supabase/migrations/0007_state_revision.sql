-- Optimistic concurrency for workshop saves. Idempotent.
-- A save must name the revision it read. A stale tab is rejected instead of wiping newer rows.

alter table public.companies add column if not exists state_revision bigint not null default 0;

drop function if exists public.save_company_state(jsonb);

create function public.save_company_state(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  rev bigint;
  expected bigint;
begin
  select m.company_id into cid
  from public.memberships m
  join public.companies c on c.id = m.company_id and c.status = 'active'
  where m.user_id = auth.uid()
    and m.active
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end
  limit 1;
  if cid is null then
    raise exception 'A oficina ainda não está ativa';
  end if;

  select state_revision into rev from public.companies where id = cid for update;
  if rev is null then
    rev := 0;
  end if;
  if payload->>'baseRevision' is null or payload->>'baseRevision' !~ '^[0-9]+$' then
    raise exception 'revision desatualizada';
  end if;
  expected := (payload->>'baseRevision')::bigint;
  if expected is distinct from rev then
    raise exception 'revision desatualizada';
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

  update public.companies set state_revision = rev + 1 where id = cid;
  return rev + 1;
end;
$$;

grant execute on function public.save_company_state(jsonb) to authenticated;

notify pgrst, 'reload schema';

