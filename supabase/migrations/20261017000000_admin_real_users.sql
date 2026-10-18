-- Admin lists read real (non-anonymous) accounts straight from auth.users.
-- Paging auth.admin.listUsers broke once every visitor got an anonymous
-- session (9.5k+ anon users pushed the real ones past the page cap).
create or replace function public.admin_real_users()
returns table (id uuid, email text, created_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, is_anonymous boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.created_at, u.email_confirmed_at, u.last_sign_in_at, coalesce(u.is_anonymous, false)
    from auth.users u
   where not coalesce(u.is_anonymous, false) and u.email is not null
   order by u.created_at;
$$;
revoke all on function public.admin_real_users() from public, anon, authenticated;
grant execute on function public.admin_real_users() to service_role;
