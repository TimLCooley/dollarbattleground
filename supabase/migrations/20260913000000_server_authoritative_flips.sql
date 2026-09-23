-- C1 fix: make the live board server-authoritative.
-- Before: claim_tiles was granted to anon/authenticated and called straight from
-- the browser — anyone could paint the whole board for free, bypassing Stripe.
-- After: clients can no longer paint arbitrarily. Paid flips happen only on the
-- server (service_role) after Stripe confirms payment; the one free first tile
-- is a guarded, once-per-user RPC.

-- 1) Server-authoritative paid paint. Runs as service_role (from the Stripe
--    webhook / finalize route), so it sets the owner explicitly (no auth.uid()).
create or replace function public.claim_paid(
  p_cells jsonb,
  p_team  text,
  p_owner uuid
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
     set team = p_team,
         owner_id = p_owner,
         updated_at = now()
    from jsonb_array_elements(p_cells) as c
   where t.x = (c ->> 'x')::int
     and t.y = (c ->> 'y')::int;
end;
$$;

revoke all on function public.claim_paid(jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_paid(jsonb, text, uuid) to service_role;

-- 2) One free first tile per user, enforced server-side. A dedicated table (not
--    a profiles column) keeps this self-contained and race-safe via the PK.
create table if not exists public.free_claims (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
alter table public.free_claims enable row level security;
-- No policies: only the SECURITY DEFINER function below touches this table.

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
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_team not in ('red', 'blue') then
    raise exception 'invalid team %', p_team;
  end if;
  if p_x < 0 or p_x > 14 or p_y < 0 or p_y > 14 then
    raise exception 'out of range';
  end if;

  -- Consume the one free claim; the PK makes a second attempt throw.
  begin
    insert into public.free_claims (user_id) values (v_uid);
  exception when unique_violation then
    raise exception 'free tile already used';
  end;

  update public.tiles
     set team = p_team,
         owner_id = v_uid,
         updated_at = now()
   where x = p_x and y = p_y;
end;
$$;

revoke all on function public.claim_free_tile(int, int, text) from public;
grant execute on function public.claim_free_tile(int, int, text)
  to anon, authenticated;

-- 3) Revoke the old unrestricted client paint. Clients can no longer paint the
--    board directly; the function stays (owned/defined) but only service_role
--    reaches an equivalent via claim_paid.
revoke execute on function public.claim_tiles(jsonb, text) from anon, authenticated;
