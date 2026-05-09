-- Profiles table + super-admin trigger.
-- Trigger lives in `private` schema (NOT public) per Supabase SECURITY DEFINER guidance.

create schema if not exists private;
revoke all on schema private from anon, authenticated, public;

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  team        text         check (team in ('red', 'blue')),
  is_admin    boolean      not null default false,
  email       text
);

comment on table public.profiles is 'One row per auth user. team/email nullable until the user picks a side or upgrades.';

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ( (select auth.uid()) = id );

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using ( coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) )
  with check ( coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false) );

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean := (new.email = 'timlcooley@gmail.com');
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, v_is_admin);

  if v_is_admin then
    update auth.users
       set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                               || jsonb_build_object('is_admin', true)
     where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
