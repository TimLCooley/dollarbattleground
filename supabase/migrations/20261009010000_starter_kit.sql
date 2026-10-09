-- Starter kit (Tim, 2026-10-09): Founding Officers start with a 3×3 + 2×2 + 1×1;
-- everyone after them starts with a 2×2 + 1×1. flip_bank gains banked 3×3s.
alter table public.flip_bank add column if not exists strikes integer not null default 0;

create or replace function public.credit_bank(p_owner uuid, p_singles integer, p_blocks integer, p_strikes integer default 0)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.flip_bank (user_id, singles, blocks, strikes)
    values (p_owner, greatest(coalesce(p_singles,0),0), greatest(coalesce(p_blocks,0),0), greatest(coalesce(p_strikes,0),0))
  on conflict (user_id) do update
    set singles = public.flip_bank.singles + greatest(coalesce(p_singles,0),0),
        blocks  = public.flip_bank.blocks  + greatest(coalesce(p_blocks,0),0),
        strikes = public.flip_bank.strikes + greatest(coalesce(p_strikes,0),0),
        updated_at = now();
end $$;
drop function if exists public.credit_bank(uuid, integer, integer);

create or replace function public.free_claims_founding_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.founding_officer then
    perform public.credit_bank(new.user_id, 1, 1, 1);  -- 3×3 + 2×2 + 1×1
  else
    perform public.credit_bank(new.user_id, 1, 1, 0);  -- 2×2 + 1×1
  end if;
  return new;
end $$;

create or replace function public.claim_banked(p_center integer, p_kind text, p_team text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_x int := p_center % 15;
  v_y int := p_center / 15;
  v_x0 int; v_y0 int; v_rows int; v_overlap int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team not in ('red','blue') then raise exception 'invalid team %', p_team; end if;
  if p_kind not in ('flip','x','strike') then raise exception 'invalid banked kind %', p_kind; end if;
  if p_center < 0 or p_center >= 225 then raise exception 'invalid center %', p_center; end if;

  if p_kind = 'strike' then
    update public.flip_bank set strikes = strikes - 1, updated_at = now() where user_id = v_uid and strikes > 0;
  elsif p_kind = 'x' then
    update public.flip_bank set blocks = blocks - 1, updated_at = now() where user_id = v_uid and blocks > 0;
  else
    update public.flip_bank set singles = singles - 1, updated_at = now() where user_id = v_uid and singles > 0;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return -1; end if;

  if p_kind = 'strike' then
    -- 3×3 centred on the tap, clipped to the board (same as strikePattern)
    select count(*) into v_overlap from public.tiles
      where team = p_team and x between v_x-1 and v_x+1 and y between v_y-1 and v_y+1;
    update public.tiles set team = p_team, owner_id = v_uid, updated_at = now()
      where x between v_x-1 and v_x+1 and y between v_y-1 and v_y+1;
    if v_overlap > 0 then
      update public.flip_bank set singles = singles + v_overlap, updated_at = now() where user_id = v_uid;
    end if;
    return 9;
  elsif p_kind = 'x' then
    v_x0 := least(v_x, 13);
    v_y0 := least(v_y, 13);
    select count(*) into v_overlap from public.tiles
      where team = p_team and (x, y) in ((v_x0,v_y0),(v_x0+1,v_y0),(v_x0,v_y0+1),(v_x0+1,v_y0+1));
    update public.tiles set team = p_team, owner_id = v_uid, updated_at = now()
      where (x, y) in ((v_x0,v_y0),(v_x0+1,v_y0),(v_x0,v_y0+1),(v_x0+1,v_y0+1));
    if v_overlap > 0 then
      update public.flip_bank set singles = singles + v_overlap, updated_at = now() where user_id = v_uid;
    end if;
    return 4;
  else
    update public.tiles set team = p_team, owner_id = v_uid, updated_at = now() where x = v_x and y = v_y;
    return 1;
  end if;
end $$;

-- the two founders already got 2×2 + 1×1 yesterday; top them up with the 3×3
update public.flip_bank b set strikes = strikes + 1, updated_at = now()
  from public.free_claims f where f.user_id = b.user_id and f.founding_officer and b.strikes = 0;
