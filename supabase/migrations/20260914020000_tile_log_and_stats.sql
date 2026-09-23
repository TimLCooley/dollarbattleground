-- Tile ownership log + server-authoritative player stats. This is what lets the
-- agents decide "who to mess with": full history of every tile (last owner +
-- all owners) and each player's action points / spend / captures.

-- 1) Every flip is logged. Latest row for a cell = current owner; the row
--    before it = who just got flipped (retaliation targets).
create table if not exists public.tile_events (
  id         bigint generated always as identity primary key,
  x          int  not null,
  y          int  not null,
  team       text not null,
  owner_id   uuid,
  source     text not null default 'paid',   -- 'paid' | 'free'
  created_at timestamptz not null default now()
);
create index if not exists tile_events_cell  on public.tile_events (x, y, created_at desc);
create index if not exists tile_events_owner on public.tile_events (owner_id, created_at desc);
alter table public.tile_events enable row level security;
-- No client policies: agents/admin read it via service role.

-- 2) Per-player running stats (action points, spend, captures).
create table if not exists public.player_stats (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  actions        int not null default 0,     -- action points (paid + free moves)
  spent_cents    int not null default 0,
  captures       int not null default 0,
  side           text,
  last_action_at timestamptz,
  updated_at     timestamptz not null default now()
);
alter table public.player_stats enable row level security;
create policy "player_stats_read_own"
  on public.player_stats for select to authenticated
  using ((select auth.uid()) = user_id);

-- 3) Paid paint now also logs history + bumps stats (atomic with the flip).
drop function if exists public.claim_paid(jsonb, text, uuid);
create or replace function public.claim_paid(
  p_cells        jsonb,
  p_team         text,
  p_owner        uuid,
  p_amount_cents int default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_team not in ('red', 'blue') then
    raise exception 'invalid team %', p_team;
  end if;

  update public.tiles t
     set team = p_team, owner_id = p_owner, updated_at = now()
    from jsonb_array_elements(p_cells) as c
   where t.x = (c ->> 'x')::int and t.y = (c ->> 'y')::int;

  insert into public.tile_events (x, y, team, owner_id, source)
  select (c ->> 'x')::int, (c ->> 'y')::int, p_team, p_owner, 'paid'
  from jsonb_array_elements(p_cells) as c;

  insert into public.player_stats
    (user_id, actions, spent_cents, captures, side, last_action_at, updated_at)
  values
    (p_owner, 1, p_amount_cents, jsonb_array_length(p_cells), p_team, now(), now())
  on conflict (user_id) do update set
    actions        = public.player_stats.actions + 1,
    spent_cents    = public.player_stats.spent_cents + p_amount_cents,
    captures       = public.player_stats.captures + jsonb_array_length(p_cells),
    side           = p_team,
    last_action_at = now(),
    updated_at     = now();
end;
$$;
revoke all on function public.claim_paid(jsonb, text, uuid, int)
  from public, anon, authenticated;
grant execute on function public.claim_paid(jsonb, text, uuid, int) to service_role;

-- 4) Free first tile also logs + bumps stats.
create or replace function public.claim_free_tile(
  p_x    int,
  p_y    int,
  p_team text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team not in ('red', 'blue') then raise exception 'invalid team %', p_team; end if;
  if p_x < 0 or p_x > 14 or p_y < 0 or p_y > 14 then raise exception 'out of range'; end if;

  begin
    insert into public.free_claims (user_id) values (v_uid);
  exception when unique_violation then
    raise exception 'free tile already used';
  end;

  update public.tiles
     set team = p_team, owner_id = v_uid, updated_at = now()
   where x = p_x and y = p_y;

  insert into public.tile_events (x, y, team, owner_id, source)
  values (p_x, p_y, p_team, v_uid, 'free');

  insert into public.player_stats
    (user_id, actions, spent_cents, captures, side, last_action_at, updated_at)
  values (v_uid, 1, 0, 1, p_team, now(), now())
  on conflict (user_id) do update set
    actions        = public.player_stats.actions + 1,
    captures       = public.player_stats.captures + 1,
    side           = p_team,
    last_action_at = now(),
    updated_at     = now();
end;
$$;
revoke all on function public.claim_free_tile(int, int, text) from public;
grant execute on function public.claim_free_tile(int, int, text) to anon, authenticated;
