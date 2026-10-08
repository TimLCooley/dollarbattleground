-- The first 100 players to sign up (claim their free position) are commissioned
-- as officers — Founding Officers — without a paid strike. Decided 2026-10-07.
-- Also: social views (TikTok / Instagram / YouTube via RobinReach) on agent_posts.

alter table public.free_claims
  add column if not exists side text,
  add column if not exists founding_officer boolean not null default false,
  add column if not exists created_at timestamptz not null default now();

create or replace function public.free_claims_founding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.founding_officer := (select count(*) from public.free_claims where founding_officer) < 100;
  return new;
end $$;
drop trigger if exists free_claims_founding on public.free_claims;
create trigger free_claims_founding before insert on public.free_claims
  for each row execute function public.free_claims_founding();

-- claim_free_tile records the side the player picked.
create or replace function public.claim_free_tile(p_x int, p_y int, p_team text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team not in ('red', 'blue') then raise exception 'invalid team %', p_team; end if;
  if p_x < 0 or p_x > 14 or p_y < 0 or p_y > 14 then raise exception 'out of range'; end if;
  begin
    insert into public.free_claims (user_id, side) values (v_uid, p_team);
  exception when unique_violation then
    raise exception 'free tile already used';
  end;
  update public.tiles set team = p_team, owner_id = v_uid, updated_at = now() where x = p_x and y = p_y;
end $$;

-- What the signed-in player is: founding officer? paid officer? which number?
create or replace function public.my_status()
returns json language sql security definer set search_path = '' stable as $$
  select json_build_object(
    'founding_officer', coalesce((select founding_officer from public.free_claims where user_id = auth.uid()), false),
    'founding_number', (select count(*) from public.free_claims f2 where f2.founding_officer and f2.created_at <= (select created_at from public.free_claims where user_id = auth.uid())),
    'paid_officer', coalesce((select spent_cents >= 500 from public.player_stats where user_id = auth.uid()), false),
    'founding_open', greatest(0, 100 - (select count(*) from public.free_claims where founding_officer))
  );
$$;
revoke all on function public.my_status() from public;
grant execute on function public.my_status() to authenticated;

-- Officers per side (founding or paid), for the recruiter and the scoreboard.
create or replace function public.officers_on(p_side text)
returns int language sql security definer set search_path = '' stable as $$
  select count(distinct u)::int from (
    select user_id as u from public.free_claims where founding_officer and side = p_side
    union
    select user_id from public.player_stats where spent_cents >= 500 and side = p_side
  ) x;
$$;
grant execute on function public.officers_on(text) to service_role;

alter table public.agent_posts
  add column if not exists social jsonb,
  add column if not exists social_views integer,
  add column if not exists social_at timestamptz;
