-- Staff usernames, NIF keys and plate-lookup cache. Idempotent.
-- Apply in the SQL editor after 0005. Does not change the owner's password.

create table if not exists public.staff_accounts (
  company_id uuid not null references public.companies (id) on delete cascade,
  username text not null,
  user_id uuid not null,
  kind text not null default 'staff' check (kind in ('owner', 'staff')),
  active boolean not null default true,
  primary key (company_id, username)
);

create unique index if not exists staff_accounts_user_idx on public.staff_accounts (company_id, user_id);

alter table public.staff_accounts enable row level security;
revoke all on table public.staff_accounts from public, anon, authenticated;

insert into public.staff_accounts (company_id, username, user_id, kind, active)
select distinct on (m.company_id) m.company_id, 'admin', m.user_id, 'owner', true
from public.memberships m
where m.role = 'owner'
order by m.company_id, m.created_at
on conflict (company_id, username) do nothing;

create table if not exists public.nif_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  api_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.nif_connections enable row level security;
revoke all on table public.nif_connections from public, anon, authenticated;

create table if not exists public.plate_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  provider text not null default 'a_definir',
  module_key text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.plate_connections enable row level security;
revoke all on table public.plate_connections from public, anon, authenticated;

create table if not exists public.plate_lookups (
  company_id uuid not null references public.companies (id) on delete cascade,
  plate text not null,
  looked_up_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  primary key (company_id, plate)
);

alter table public.plate_lookups enable row level security;
revoke all on table public.plate_lookups from public, anon, authenticated;

-- A staff auth user must not become a new workshop.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cid uuid;
  company_name text;
  wanted text;
  candidate text;
  n int;
begin
  if exists (select 1 from public.memberships where user_id = new.id) then
    return new;
  end if;
  if coalesce(new.raw_user_meta_data->>'staff_username', '') <> ''
     or coalesce(new.email, '') like '%@staff.oficinaplan.invalid' then
    return new;
  end if;
  if exists (
    select 1 from public.staff_invites
    where lower(email) = lower(coalesce(new.email, ''))
      and used_at is null
      and expires_at > now()
  ) then
    return new;
  end if;
  company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  wanted := public.slugify_name(coalesce(new.raw_user_meta_data->>'company_slug', ''));
  if new.raw_user_meta_data ? 'company_slug' then
    if wanted is null or length(wanted) < 2 or public.slug_is_reserved(wanted) then
      raise exception 'Endereço da oficina inválido';
    end if;
    if exists (select 1 from public.companies where slug = wanted) then
      raise exception 'Este endereço já está a ser usado';
    end if;
  else
    wanted := coalesce(public.slugify_name(company_name), 'oficina-' || substr(replace(new.id::text, '-', ''), 1, 8));
    if public.slug_is_reserved(wanted) then
      wanted := 'oficina-' || substr(replace(new.id::text, '-', ''), 1, 8);
    end if;
    candidate := wanted;
    n := 2;
    while exists (select 1 from public.companies where slug = candidate) loop
      candidate := wanted || '-' || n::text;
      n := n + 1;
    end loop;
    wanted := candidate;
  end if;
  insert into public.companies (name, status, slug)
  values (coalesce(company_name, 'A minha oficina'), 'pending', wanted)
  returning id into cid;
  insert into public.memberships (user_id, company_id, role, active)
  values (new.id, cid, 'owner', true);
  return new;
end;
$$;

-- The workshop can no longer rename its own link.
create or replace function public.set_company_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  raise exception 'Só a administração do OficinaPlan pode mudar o endereço';
end;
$$;

create or replace function public.admin_set_company_slug(p_company_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  wanted text := public.slugify_name(p_slug);
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administração';
  end if;
  if wanted is null or length(wanted) < 2 or length(wanted) > 40 or public.slug_is_reserved(wanted) then
    raise exception 'Endereço da oficina inválido';
  end if;
  if exists (select 1 from public.companies where slug = wanted and id <> p_company_id) then
    raise exception 'Este endereço já está a ser usado';
  end if;
  update public.companies set slug = wanted where id = p_company_id;
  if not found then
    raise exception 'Empresa não encontrada';
  end if;
  return wanted;
end;
$$;

create or replace function public.admin_list_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Sem permissão de administração';
  end if;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug,
        'status', c.status,
        'created_at', c.created_at,
        'approved_at', c.approved_at,
        'notes', c.notes,
        'owner_email', (
          select u.email::text
          from public.memberships m
          join auth.users u on u.id = m.user_id
          where m.company_id = c.id and m.role = 'owner'
          order by m.created_at
          limit 1
        )
      )
      order by c.created_at desc
    )
    from public.companies c
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.set_company_slug(text) to authenticated;
grant execute on function public.admin_set_company_slug(uuid, text) to authenticated;
grant execute on function public.admin_list_companies() to authenticated;

notify pgrst, 'reload schema';
