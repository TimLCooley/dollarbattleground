-- Resupply drop (Tim, 2026-10-14): the trailing side's extra supplies arrive
-- as a crate the player opens with "Collect" instead of silently in the bank.
-- Line stays at 40/60 — no push past that toward 50/50.
create table if not exists public.resupplies (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null,
  singles int not null default 0, blocks int not null default 0, strikes int not null default 0,
  issued_on date not null default (now() at time zone 'America/Denver')::date,
  created_at timestamptz not null default now(),
  collected_at timestamptz
);
create unique index if not exists resupplies_one_a_day on public.resupplies (user_id, issued_on);
alter table public.resupplies enable row level security;
drop policy if exists resupplies_own on public.resupplies;
create policy resupplies_own on public.resupplies for select to authenticated using (user_id = auth.uid());

-- The daily top-up goes back to the plain kit; the underdog extra moves to the crate.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.issue_daily_supplies'::regproc);
  v_def := replace(v_def, 'when (e.officer or e.under) and e.blocks < 1', 'when e.officer and e.blocks < 1');
  v_def := replace(v_def, 'case when e.deep and e.strikes < 1 then 1 else 0 end as add_x', '0 as add_x');
  execute v_def;
end $$;

-- On a visit: if your side is under 40%, one crate a day (2×2, plus a 3×3
-- under 30%) — unless you're still sitting on unused supplies.
create or replace function public.my_resupply()
returns public.resupplies language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_side text; v public.resupplies;
  v_blocks int; v_strikes int;
begin
  if v_uid is null then return null; end if;
  select side into v_side from public.free_claims where user_id = v_uid;
  if v_side is null then return null; end if;
  select * into v from public.resupplies where user_id = v_uid and collected_at is null order by id desc limit 1;
  if found then return v; end if;
  if not public.is_underdog(v_side) then return null; end if;
  select coalesce(blocks, 0), coalesce(strikes, 0) into v_blocks, v_strikes from public.flip_bank where user_id = v_uid;
  if coalesce(v_blocks, 0) >= 2 and coalesce(v_strikes, 0) >= 1 then return null; end if; -- still stocked
  insert into public.resupplies (user_id, side, blocks, strikes)
  values (v_uid, v_side, 1, case when public.side_share(v_side) < 0.30 then 1 else 0 end)
  on conflict (user_id, issued_on) do nothing
  returning * into v;
  return v;
end $$;
revoke all on function public.my_resupply() from public, anon;
grant execute on function public.my_resupply() to authenticated;

create or replace function public.collect_resupply(p_id bigint)
returns public.resupplies language plpgsql security definer set search_path = '' as $$
declare v public.resupplies;
begin
  update public.resupplies set collected_at = now()
   where id = p_id and user_id = auth.uid() and collected_at is null
  returning * into v;
  if not found then return null; end if;
  perform public.credit_bank(v.user_id, v.singles, v.blocks, v.strikes);
  return v;
end $$;
revoke all on function public.collect_resupply(bigint) from public, anon;
grant execute on function public.collect_resupply(bigint) to authenticated;
