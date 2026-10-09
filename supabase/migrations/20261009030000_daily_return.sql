-- Come back daily (Tim, 2026-10-09): once per Mountain-time day, a returning
-- player gets a free 1×1 in their bank. Not on the first day, not per visit.
alter table public.flip_bank add column if not exists last_daily_on date;

create or replace function public.daily_return()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Denver')::date;
  v_joined date;
  v_rows int;
begin
  if v_uid is null then return 0; end if;
  select (created_at at time zone 'America/Denver')::date into v_joined from public.free_claims where user_id = v_uid;
  if v_joined is null or v_joined >= v_today then return 0; end if; -- not a player yet, or it's their first day
  insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on) values (v_uid, 1, 0, 0, v_today)
  on conflict (user_id) do update set singles = public.flip_bank.singles + 1, last_daily_on = v_today, updated_at = now()
    where public.flip_bank.last_daily_on is distinct from v_today;
  get diagnostics v_rows = row_count;
  return v_rows; -- 1 = granted today, 0 = already had it
end $$;
revoke all on function public.daily_return() from public;
grant execute on function public.daily_return() to authenticated;
