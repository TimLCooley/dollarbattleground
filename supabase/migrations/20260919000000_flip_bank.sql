-- Flip bank: server-authoritative "banked" bonus placements.
--
-- A paid purchase grants more than the block it paints:
--   $5  (2×2) → + 2 single tiles
--   $10 (3×3) → + 1 2×2 block + 1 single tile
-- and any tile inside a painted block the buyer ALREADY owns is "wasted", so it
-- converts into a banked single instead (the overlap / no-waste rule).
--
-- The bank must live on the server or free tiles could be forged. Clients can
-- only READ their own bank; it is credited by the Stripe fulfillment path
-- (service_role) and spent through a guarded SECURITY DEFINER function that
-- derives the painted cells itself.

create table if not exists public.flip_bank (
  user_id uuid primary key references auth.users (id) on delete cascade,
  singles int not null default 0 check (singles >= 0),
  blocks  int not null default 0 check (blocks >= 0),
  updated_at timestamptz not null default now()
);

alter table public.flip_bank enable row level security;

-- Read your own bank. No write policies: all mutations go through the definer
-- functions below (which bypass RLS), so a client can never grant itself pieces.
drop policy if exists "read own bank" on public.flip_bank;
create policy "read own bank" on public.flip_bank
  for select using (auth.uid() = user_id);

-- Credit the bank after a confirmed purchase. service_role only.
create or replace function public.credit_bank(
  p_owner uuid,
  p_singles int,
  p_blocks int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.flip_bank (user_id, singles, blocks)
    values (p_owner, greatest(coalesce(p_singles, 0), 0), greatest(coalesce(p_blocks, 0), 0))
  on conflict (user_id) do update
    set singles = public.flip_bank.singles + greatest(coalesce(p_singles, 0), 0),
        blocks  = public.flip_bank.blocks  + greatest(coalesce(p_blocks, 0), 0),
        updated_at = now();
end;
$$;

revoke all on function public.credit_bank(uuid, int, int) from public, anon, authenticated;
grant execute on function public.credit_bank(uuid, int, int) to service_role;

-- Spend one banked piece and paint it. Runs as the signed-in user (auth.uid()),
-- atomically consumes from their bank, and derives the exact cells from the
-- center + kind — the client cannot widen the blast or forge a free piece.
-- Returns the number of tiles painted, or -1 when the bank is empty.
--   p_kind: 'flip' spends a single (1 tile); 'x' spends a block (2×2).
create or replace function public.claim_banked(
  p_center int,
  p_kind text,
  p_team text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_x int := p_center % 15;
  v_y int := p_center / 15;
  v_x0 int;
  v_y0 int;
  v_rows int;
  v_overlap int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team not in ('red', 'blue') then raise exception 'invalid team %', p_team; end if;
  if p_kind not in ('flip', 'x') then raise exception 'invalid banked kind %', p_kind; end if;
  if p_center < 0 or p_center >= 225 then raise exception 'invalid center %', p_center; end if;

  -- Atomically consume from the bank (the WHERE guards against going negative).
  if p_kind = 'x' then
    update public.flip_bank set blocks = blocks - 1, updated_at = now()
      where user_id = v_uid and blocks > 0;
  else
    update public.flip_bank set singles = singles - 1, updated_at = now()
      where user_id = v_uid and singles > 0;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return -1; -- nothing banked of that kind
  end if;

  if p_kind = 'x' then
    -- 2×2 block, top-left anchored + clamped to stay on the board.
    v_x0 := least(v_x, 13);
    v_y0 := least(v_y, 13);
    -- No-waste: tiles in the block we already own convert to banked singles.
    select count(*) into v_overlap from public.tiles
      where team = p_team
        and (x, y) in ((v_x0, v_y0), (v_x0 + 1, v_y0), (v_x0, v_y0 + 1), (v_x0 + 1, v_y0 + 1));
    update public.tiles set team = p_team, owner_id = v_uid, updated_at = now()
      where (x, y) in ((v_x0, v_y0), (v_x0 + 1, v_y0), (v_x0, v_y0 + 1), (v_x0 + 1, v_y0 + 1));
    if v_overlap > 0 then
      update public.flip_bank set singles = singles + v_overlap, updated_at = now()
        where user_id = v_uid;
    end if;
    return 4;
  else
    update public.tiles set team = p_team, owner_id = v_uid, updated_at = now()
      where x = v_x and y = v_y;
    return 1;
  end if;
end;
$$;

revoke all on function public.claim_banked(int, text, text) from public, anon;
grant execute on function public.claim_banked(int, text, text) to authenticated;

-- Realtime so the client's FREE labels update the instant the bank changes.
do $$
begin
  alter publication supabase_realtime add table public.flip_bank;
exception
  when duplicate_object then null; -- already published
  when undefined_object then null; -- publication missing; realtime optional
end;
$$;
