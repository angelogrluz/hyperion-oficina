-- 0010: novas obras continuam a numeração do Keymaster («2026/303»), por ano, em vez de «OR-2026-0001».
-- 1) assign_document_number('OR') devolve «<ano>/<n>» e nunca fica abaixo da obra mais alta do ano
--    (histórico importado «2026/57», «HIST-2026/57», «2026/57_1», «2026/57-FT…», ou antigas «OR-2026-0001»).
--    Assim, se mais tarde entrar outra importação com números mais altos, a seguinte salta por cima.
-- 2) As obras de teste já criadas como «OR-<ano>-NNNN» passam para os números seguintes (pela ordem do número).
--    O mapeamento antigo → novo fica guardado em public.obra_renumber_0010.
-- 3) O contador OR fica alinhado e a revisão do estado sobe, para os browsers abertos recarregarem sem
--    voltarem a gravar os números antigos.
-- Idempotente: correr outra vez não muda nada (já não há «OR-<ano>-NNNN» e greatest() mantém o contador).
-- Os restantes formatos (ORC, ORCDOC, FT) ficam iguais.

create or replace function public.obra_sequence_value(p_number text, p_year int)
returns int
language sql
immutable
as $$
  select case
    when p_number ~* '^(HIST-)?\d{4}/\d+' and substring(p_number from '(?i)^(?:HIST-)?(\d{4})/')::int = p_year
      then substring(p_number from '(?i)^(?:HIST-)?\d{4}/(\d+)')::int
    when p_number ~* '^OR-\d{4}-\d+$' and substring(p_number from '(?i)^OR-(\d{4})-')::int = p_year
      then substring(p_number from '(?i)^OR-\d{4}-(\d+)$')::int
    else null
  end
$$;

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
  v_max int;
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
  if v_series = 'OR' then
    select coalesce(max(public.obra_sequence_value(o.number, yr)), 0) into v_max
    from public.orders o where o.company_id = cid;
    insert into public.document_counters as dc (company_id, series, year, last_value)
    values (cid, v_series, yr, v_max + 1)
    on conflict (company_id, series, year)
    do update set last_value = greatest(dc.last_value, v_max) + 1
    returning dc.last_value into n;
    return yr::text || '/' || n::text;
  end if;
  insert into public.document_counters as dc (company_id, series, year, last_value)
  values (cid, v_series, yr, 1)
  on conflict (company_id, series, year)
  do update set last_value = dc.last_value + 1
  returning dc.last_value into n;
  if v_series = 'ORC' then
    return 'ORC-' || yr::text || '-' || lpad(n::text, 4, '0');
  elsif v_series = 'ORCDOC' then
    return 'ORC A/' || yr::text || '/' || lpad(n::text, 4, '0');
  else
    return 'FT A/' || yr::text || '/' || lpad(n::text, 4, '0');
  end if;
end;
$$;

grant execute on function public.assign_document_number(text) to authenticated;

-- Renumber test obras «OR-<ano>-NNNN» after the highest Keymaster-style obra of the same year.
create table if not exists public.obra_renumber_0010 (
  company_id uuid not null,
  order_id text not null,
  old_number text not null,
  new_number text not null,
  renumbered_at timestamptz not null default now(),
  primary key (company_id, order_id)
);
alter table public.obra_renumber_0010 enable row level security;

with legacy as (
  select o.company_id, o.id, o.number,
         substring(o.number from '^OR-(\d{4})-')::int as yr,
         row_number() over (partition by o.company_id, substring(o.number from '^OR-(\d{4})-')
                            order by substring(o.number from '^OR-\d{4}-(\d+)$')::int, o.created_at) as pos
  from public.orders o
  where o.number ~ '^OR-\d{4}-\d+$'
),
base as (
  select l.company_id, l.yr,
         coalesce((select max(substring(x.number from '(?i)^(?:HIST-)?\d{4}/(\d+)')::int)
                   from public.orders x
                   where x.company_id = l.company_id
                     and x.number ~* '^(HIST-)?\d{4}/\d+'
                     and substring(x.number from '(?i)^(?:HIST-)?(\d{4})/')::int = l.yr), 0) as max_kept
  from (select distinct company_id, yr from legacy) l
),
mapped as (
  select l.company_id, l.id, l.number as old_number, l.yr::text || '/' || (b.max_kept + l.pos)::text as new_number
  from legacy l join base b on b.company_id = l.company_id and b.yr = l.yr
),
logged as (
  insert into public.obra_renumber_0010 (company_id, order_id, old_number, new_number)
  select company_id, id, old_number, new_number from mapped
  on conflict (company_id, order_id) do nothing
  returning company_id
)
update public.orders o
set number = m.new_number, updated_at = now()
from mapped m
where o.company_id = m.company_id and o.id = m.id;

-- Align the OR counter with the highest obra of each year (never lowers it).
insert into public.document_counters as dc (company_id, series, year, last_value)
select s.company_id, 'OR', s.yr, max(s.value)
from (
  select o.company_id,
         substring(o.number from '(?i)^(?:HIST-)?(\d{4})/')::int as yr,
         substring(o.number from '(?i)^(?:HIST-)?\d{4}/(\d+)')::int as value
  from public.orders o
  where o.number ~* '^(HIST-)?\d{4}/\d+'
) s
group by s.company_id, s.yr
on conflict (company_id, series, year)
do update set last_value = greatest(dc.last_value, excluded.last_value);

-- Make open browsers reload before saving (otherwise a stale tab could write the old numbers back).
update public.companies c
set state_revision = c.state_revision + 1
where exists (select 1 from public.obra_renumber_0010 r where r.company_id = c.id and r.renumbered_at = now());

notify pgrst, 'reload schema';
