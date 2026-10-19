-- "Last active" for the admin list: a signed-in player opening either mode
-- stamps the time, even if they only look around.
create table if not exists public.player_seen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table public.player_seen enable row level security;

create or replace function public.touch_seen()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return;
  end if;
  insert into public.player_seen (user_id, seen_at) values (auth.uid(), now())
    on conflict (user_id) do update set seen_at = now();
end;
$$;
revoke all on function public.touch_seen() from public, anon;
grant execute on function public.touch_seen() to authenticated;
