-- Daily supplies top up, they don't pile up (Tim, 2026-10-12): each day a
-- player is brought back to at least 1×1 (officers: at least 1×1 and 1×2×2).
-- Unused pieces stay; nothing is removed; nothing is added if they still have it.
create or replace function public.issue_daily_supplies()
returns table (user_id uuid, side text, officer boolean, add_singles int, add_blocks int)
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Denver')::date;
begin
  return query
  with eligible as (
    select f.user_id, f.side,
           (f.founding_officer or coalesce((select s.spent_cents >= 500 from public.player_stats s where s.user_id = f.user_id), false)) as officer,
           coalesce(b.singles, 0) as singles, coalesce(b.blocks, 0) as blocks
      from public.free_claims f
      left join public.flip_bank b on b.user_id = f.user_id
     where (f.created_at at time zone 'America/Denver')::date < v_today
       and b.last_daily_on is distinct from v_today
  ), plan as (
    select e.*, case when e.singles < 1 then 1 else 0 end as add_s,
                case when e.officer and e.blocks < 1 then 1 else 0 end as add_b
      from eligible e
  ), granted as (
    insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on)
    select p.user_id, p.add_s, p.add_b, 0, v_today from plan p
    on conflict on constraint flip_bank_pkey do update
      set singles = public.flip_bank.singles + excluded.singles,
          blocks = public.flip_bank.blocks + excluded.blocks,
          last_daily_on = v_today, updated_at = now()
      where public.flip_bank.last_daily_on is distinct from v_today
    returning public.flip_bank.user_id
  )
  select p.user_id, p.side, p.officer, p.add_s, p.add_b
    from plan p join granted g on g.user_id = p.user_id;
end $$;

create or replace function public.daily_return()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Denver')::date;
  v_joined date; v_officer boolean; v_s int := 0; v_b int := 0; v_add_s int; v_add_b int; v_rows int;
begin
  if v_uid is null then return 0; end if;
  select (created_at at time zone 'America/Denver')::date, founding_officer into v_joined, v_officer from public.free_claims where user_id = v_uid;
  if v_joined is null or v_joined >= v_today then return 0; end if;
  v_officer := coalesce(v_officer, false) or coalesce((select spent_cents >= 500 from public.player_stats where user_id = v_uid), false);
  select coalesce(singles,0), coalesce(blocks,0) into v_s, v_b from public.flip_bank where user_id = v_uid;
  v_add_s := case when coalesce(v_s,0) < 1 then 1 else 0 end;
  v_add_b := case when v_officer and coalesce(v_b,0) < 1 then 1 else 0 end;
  insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on) values (v_uid, v_add_s, v_add_b, 0, v_today)
  on conflict (user_id) do update
    set singles = public.flip_bank.singles + v_add_s, blocks = public.flip_bank.blocks + v_add_b, last_daily_on = v_today, updated_at = now()
    where public.flip_bank.last_daily_on is distinct from v_today;
  get diagnostics v_rows = row_count;
  if v_rows = 0 or (v_add_s = 0 and v_add_b = 0) then return 0; end if;
  return case when v_add_b > 0 then 2 else 1 end;
end $$;
