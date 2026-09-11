-- Live 15x15 red/blue battleground board.
-- One shared, realtime board for every visitor. Anonymous auth (middleware
-- signs everyone in). Writes go through a SECURITY DEFINER RPC so clients
-- can't paint arbitrarily — mirrors the Phase-1 pattern (public read, RPC writes).

create table if not exists public.tiles (
  x          int not null check (x between 0 and 14),
  y          int not null check (y between 0 and 14),
  team       text check (team in ('red', 'blue')),
  owner_id   uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (x, y)
);

comment on table public.tiles is '15x15 live board. team null = neutral (open). Painted only via claim_tiles.';

-- pre-seed 225 neutral tiles (0..14 x 0..14)
insert into public.tiles (x, y)
select gx, gy
from generate_series(0, 14) as gx, generate_series(0, 14) as gy
on conflict (x, y) do nothing;

alter table public.tiles enable row level security;

create policy "tiles_public_read"
  on public.tiles for select
  to anon, authenticated
  using (true);

-- Batch claim: paint a set of {x, y} cells for a team. SECURITY DEFINER so it
-- runs with owner rights; anon/authenticated reach the board only through here.
create or replace function public.claim_tiles(p_cells jsonb, p_team text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if p_team not in ('red', 'blue') then
    raise exception 'invalid team %', p_team;
  end if;

  update public.tiles t
     set team = p_team,
         owner_id = v_uid,
         updated_at = now()
    from jsonb_array_elements(p_cells) as c
   where t.x = (c ->> 'x')::int
     and t.y = (c ->> 'y')::int;
end;
$$;

revoke all on function public.claim_tiles(jsonb, text) from public;
grant execute on function public.claim_tiles(jsonb, text) to anon, authenticated;

-- realtime (idempotent)
do $$
begin
  alter publication supabase_realtime add table public.tiles;
exception
  when duplicate_object then null;
end $$;
