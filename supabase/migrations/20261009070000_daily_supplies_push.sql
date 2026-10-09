-- Daily supplies are issued in the morning to every player (not only when
-- they happen to visit), so an email can tell them they're waiting.
-- Server-only; returns who got what so the caller can notify them.
create or replace function public.issue_daily_supplies()
returns table (user_id uuid, side text, officer boolean)
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Denver')::date;
begin
  return query
  with eligible as (
    select f.user_id, f.side,
           (f.founding_officer or coalesce((select s.spent_cents >= 500 from public.player_stats s where s.user_id = f.user_id), false)) as officer
      from public.free_claims f
     where (f.created_at at time zone 'America/Denver')::date < v_today
       and not exists (select 1 from public.flip_bank b where b.user_id = f.user_id and b.last_daily_on = v_today)
  ), granted as (
    insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on)
    select e.user_id, 1, case when e.officer then 1 else 0 end, 0, v_today from eligible e
    on conflict on constraint flip_bank_pkey do update
      set singles = public.flip_bank.singles + 1,
          blocks = public.flip_bank.blocks + excluded.blocks,
          last_daily_on = v_today, updated_at = now()
      where public.flip_bank.last_daily_on is distinct from v_today
    returning public.flip_bank.user_id
  )
  select e.user_id, e.side, e.officer from eligible e join granted g on g.user_id = e.user_id;
end $$;
revoke all on function public.issue_daily_supplies() from public, anon, authenticated;
grant execute on function public.issue_daily_supplies() to service_role;
