-- Drops (Tim, 2026-10-12): a personal bonus square. Only its owner sees it.
-- Chances per visit: 20% on opening the game, 70% after the first placement,
-- 100% after the second; a player's first three visits always drop on open.
-- One live drop at a time, 20 minutes; taking the square pays the reward.
create table if not exists public.player_visits (
  user_id uuid not null,
  visit_id text not null,
  placements int not null default 0,
  rolled_open boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, visit_id)
);
alter table public.player_visits enable row level security;

create table if not exists public.drops (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  x int not null,
  y int not null,
  reward_singles int not null default 0,
  reward_blocks int not null default 0,
  trigger text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz
);
create index if not exists drops_live on public.drops (user_id) where claimed_at is null;
alter table public.drops enable row level security;
drop policy if exists drops_own on public.drops;
create policy drops_own on public.drops for select to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.drops;

-- Roll for a drop. p_event: 'open' (once per visit) or 'placement'.
-- Returns the new drop, or null.
create or replace function public.roll_drop(p_visit text, p_event text)
returns public.drops language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_visits int; v_placements int; v_chance numeric; v_side text; v_r numeric;
  v_x int; v_y int; v_s int := 0; v_b int := 0; v public.drops;
begin
  if v_uid is null or p_visit is null or length(p_visit) < 6 or length(p_visit) > 64 then return null; end if;
  select side into v_side from public.free_claims where user_id = v_uid;
  if v_side is null then return null; end if; -- players only
  insert into public.player_visits (user_id, visit_id) values (v_uid, p_visit) on conflict do nothing;
  if p_event = 'open' then
    update public.player_visits set rolled_open = true where user_id = v_uid and visit_id = p_visit and not rolled_open;
    if not found then return null; end if; -- already rolled for this visit
    select count(*) into v_visits from public.player_visits where user_id = v_uid;
    v_chance := case when v_visits <= 3 then 1.0 else 0.20 end;
  elsif p_event = 'placement' then
    update public.player_visits set placements = placements + 1 where user_id = v_uid and visit_id = p_visit returning placements into v_placements;
    v_chance := case when v_placements >= 2 then 1.0 when v_placements = 1 then 0.70 else 0 end;
  else
    return null;
  end if;
  -- one live drop at a time
  if exists (select 1 from public.drops where user_id = v_uid and claimed_at is null and expires_at > now()) then return null; end if;
  if random() >= v_chance then return null; end if;
  -- a square they don't own — enemy ground first
  select t.x, t.y into v_x, v_y from public.tiles t
   where t.owner_id is distinct from v_uid
   order by (t.team is distinct from v_side) desc, random() limit 1;
  if v_x is null then return null; end if;
  v_r := random();
  if v_r < 0.15 then v_b := 1; elsif v_r < 0.40 then v_s := 2; else v_s := 1; end if;
  insert into public.drops (user_id, x, y, reward_singles, reward_blocks, trigger, expires_at)
  values (v_uid, v_x, v_y, v_s, v_b, p_event, now() + interval '20 minutes')
  returning * into v;
  return v;
end $$;
revoke all on function public.roll_drop(text, text) from public, anon;
grant execute on function public.roll_drop(text, text) to authenticated;

-- Taking it: when the drop's owner takes that square while it's live.
create or replace function public.tiles_drop_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.drops;
begin
  if new.owner_id is null or new.owner_id is not distinct from old.owner_id then return new; end if;
  update public.drops set claimed_at = now()
   where user_id = new.owner_id and x = new.x and y = new.y and claimed_at is null and expires_at > now()
  returning * into d;
  if d.id is not null then
    perform public.credit_bank(new.owner_id, d.reward_singles, d.reward_blocks, 0);
  end if;
  return new;
end $$;
drop trigger if exists tiles_drop_claim on public.tiles;
create trigger tiles_drop_claim after update on public.tiles for each row execute function public.tiles_drop_claim();
