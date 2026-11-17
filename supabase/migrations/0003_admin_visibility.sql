-- Run this whole file once in the Supabase SQL editor, after 0001 and 0002.
-- It is idempotent. It does not insert clients, vehicles, or other workshop data.
--
-- Why: admin_list_companies() is security definer, but row security can still hide
-- every company from a platform admin whose own workshop is still pending
-- (current_company_ids() only returns active companies). The list then comes back
-- empty. my_account() and admin_list_companies() also return tables whose OUT
-- names (status, id, name) clash with columns. Both functions now return jsonb
-- and turn row security off, so the admin sees every company, including their own.

drop function if exists public.my_account();
drop function if exists public.admin_list_companies();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

create or replace function public.my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'company_id', c.id,
    'company_name', c.name,
    'role', m.role,
    'status', c.status,
    'platform_admin', public.is_platform_admin()
  )
  into result
  from public.memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
  order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, m.created_at
  limit 1;

  if result is null then
    result := jsonb_build_object(
      'company_id', null,
      'company_name', null,
      'role', null,
      'status', null,
      'platform_admin', public.is_platform_admin()
    );
  end if;
  return result;
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

create or replace function public.admin_set_company_status(p_company_id uuid, p_status text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
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
grant execute on function public.my_account() to authenticated;
grant execute on function public.admin_list_companies() to authenticated;
grant execute on function public.admin_set_company_status(uuid, text, text) to authenticated;

insert into public.platform_admins (user_id)
values ('71ace32e-e8fc-4408-b788-491617aab675')
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
