-- Comeback mechanics (Tim, 2026-10-14): with few players one person can run
-- the board away; give the trailing side ways back toward 50/50.
create or replace function public.side_share(p_side text)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(count(*) filter (where team = p_side)::numeric / nullif(count(*) filter (where team in ('red','blue')), 0), 0.5)
    from public.tiles;
$$;
grant execute on function public.side_share(text) to anon, authenticated;

-- underdog = holds under 40% of the colored board
create or replace function public.is_underdog(p_side text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.side_share(p_side) < 0.40;
$$;
grant execute on function public.is_underdog(text) to anon, authenticated;

-- 1) Reinforcements in the daily top-up: underdogs are topped up to ≥1 2×2
--    (everyone on that side), and ≥1 3×3 when under 30%.
create or replace function public.issue_daily_supplies()
returns table (user_id uuid, side text, officer boolean, add_singles int, add_blocks int)
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Denver')::date;
begin
  return query
  with eligible as (
    select f.user_id, f.side,
           (f.founding_officer or coalesce((select s.spent_cents >= 500 from public.player_stats s where s.user_id = f.user_id), false)) as officer,
           public.is_underdog(f.side) as under,
           public.side_share(f.side) < 0.30 as deep,
           coalesce(b.singles, 0) as singles, coalesce(b.blocks, 0) as blocks, coalesce(b.strikes, 0) as strikes
      from public.free_claims f
      left join public.flip_bank b on b.user_id = f.user_id
     where (f.created_at at time zone 'America/Denver')::date < v_today
       and b.last_daily_on is distinct from v_today
  ), plan as (
    select e.*, case when e.singles < 1 then 1 else 0 end as add_s,
                case when (e.officer or e.under) and e.blocks < 1 then 1 else 0 end as add_b,
                case when e.deep and e.strikes < 1 then 1 else 0 end as add_x
      from eligible e
  ), granted as (
    insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on)
    select p.user_id, p.add_s, p.add_b, p.add_x, v_today from plan p
    on conflict on constraint flip_bank_pkey do update
      set singles = public.flip_bank.singles + excluded.singles,
          blocks = public.flip_bank.blocks + excluded.blocks,
          strikes = public.flip_bank.strikes + excluded.strikes,
          last_daily_on = v_today, updated_at = now()
      where public.flip_bank.last_daily_on is distinct from v_today
    returning public.flip_bank.user_id
  )
  select p.user_id, p.side, p.officer, p.add_s, p.add_b + p.add_x * 0
    from plan p join granted g on g.user_id = p.user_id;
end $$;
revoke all on function public.issue_daily_supplies() from public, anon, authenticated;
grant execute on function public.issue_daily_supplies() to service_role;

-- 2) Rally bonus: an underdog taking a square from the leader gets a 1×1
--    back 1 time in 3 (expected cost still > 0, so no loop).
create table if not exists public.rally_awards (
  id bigint generated always as identity primary key,
  user_id uuid not null, x int not null, y int not null,
  created_at timestamptz not null default now()
);
alter table public.rally_awards enable row level security;
drop policy if exists rally_own on public.rally_awards;
create policy rally_own on public.rally_awards for select to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.rally_awards;

create or replace function public.tiles_rally()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is not null and old.team is not null and old.team is distinct from new.team
     and old.owner_id is not null and public.is_underdog(new.team) and random() < 0.33
     and (select count(*) from public.rally_awards r where r.user_id = new.owner_id and r.created_at > now() - interval '24 hours') < 5 then
    perform public.credit_bank(new.owner_id, 1, 0, 0);
    insert into public.rally_awards (user_id, x, y) values (new.owner_id, new.x, new.y);
  end if;
  return new;
end $$;
drop trigger if exists tiles_rally on public.tiles;
create trigger tiles_rally after update on public.tiles for each row execute function public.tiles_rally();

-- 3) A dominant side's gold pays a 2×2 instead of a 3×3.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.tiles_gold_claim'::regproc);
  v_def := replace(v_def, 'perform public.credit_bank(new.owner_id, 0, 0, 1);',
    'if public.side_share(new.team) > 0.60 then perform public.credit_bank(new.owner_id, 0, 1, 0); else perform public.credit_bank(new.owner_id, 0, 0, 1); end if;');
  execute v_def;
  -- 4) Underdogs get 5 drops a day instead of 3.
  v_def := pg_get_functiondef('public.roll_drop(text,text)'::regprocedure);
  v_def := replace(v_def, 'and created_at > now() - interval ''24 hours'') >= 3 then return null; end if;',
    'and created_at > now() - interval ''24 hours'') >= (case when public.is_underdog(v_side) then 5 else 3 end) then return null; end if;');
  execute v_def;
end $$;

-- First reinforcements now: every player on a side under 40% gets a 2×2 (and a 3×3 under 30%).
select public.credit_bank(f.user_id, 0, 1, case when public.side_share(f.side) < 0.30 then 1 else 0 end)
  from public.free_claims f where public.is_underdog(f.side);
