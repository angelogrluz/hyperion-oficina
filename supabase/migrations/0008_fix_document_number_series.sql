-- Fix: "column reference \"series\" is ambiguous" when numbering a document.
-- assign_document_number declared a plpgsql variable named "series", the same name as the
-- document_counters.series column used in ON CONFLICT (company_id, series, year). Every call failed.
-- Same signature, same grants, same numbers; only the variable is renamed and columns are qualified.
-- Idempotent: safe to run more than once in the SQL editor.

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
  v_series text := upper(trim(p_series));
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
  if v_series not in ('OR', 'ORC', 'ORCDOC', 'FT') then
    raise exception 'Série inválida';
  end if;
  yr := extract(year from (now() at time zone 'Europe/Lisbon'))::int;
  insert into public.document_counters as dc (company_id, series, year, last_value)
  values (cid, v_series, yr, 1)
  on conflict (company_id, series, year)
  do update set last_value = dc.last_value + 1
  returning dc.last_value into n;
  if v_series = 'OR' then
    return 'OR-' || yr::text || '-' || lpad(n::text, 4, '0');
  elsif v_series = 'ORC' then
    return 'ORC-' || yr::text || '-' || lpad(n::text, 4, '0');
  elsif v_series = 'ORCDOC' then
    return 'ORC A/' || yr::text || '/' || lpad(n::text, 4, '0');
  else
    return 'FT A/' || yr::text || '/' || lpad(n::text, 4, '0');
  end if;
end;
$$;

grant execute on function public.assign_document_number(text) to authenticated;

-- The counters never advanced while the function failed. Start each counter after the highest
-- number already saved this year, so the first server number never repeats an existing one.
-- greatest() keeps a counter that is already higher; running this again changes nothing.
insert into public.document_counters as dc (company_id, series, year, last_value)
select s.company_id, s.series, s.year, max(s.value)
from (
  select o.company_id, 'OR'::text as series, substring(o.number from '^OR-(\d{4})-')::int as year, substring(o.number from '^OR-\d{4}-(\d+)$')::int as value
  from public.orders o where o.number ~ '^OR-\d{4}-\d+$'
  union all
  select q.company_id, 'ORC', substring(q.number from '^ORC-(\d{4})-')::int, substring(q.number from '^ORC-\d{4}-(\d+)$')::int
  from public.quotes q where q.number ~ '^ORC-\d{4}-\d+$'
  union all
  select o.company_id, 'ORCDOC', substring(o.quote_number from '^ORC A/(\d{4})/')::int, substring(o.quote_number from '^ORC A/\d{4}/(\d+)$')::int
  from public.orders o where o.quote_number ~ '^ORC A/\d{4}/\d+$'
  union all
  select o.company_id, 'FT', substring(o.invoice_number from '^FT A/(\d{4})/')::int, substring(o.invoice_number from '^FT A/\d{4}/(\d+)$')::int
  from public.orders o where o.invoice_number ~ '^FT A/\d{4}/\d+$'
) s
group by s.company_id, s.series, s.year
on conflict (company_id, series, year)
do update set last_value = greatest(dc.last_value, excluded.last_value);

notify pgrst, 'reload schema';
