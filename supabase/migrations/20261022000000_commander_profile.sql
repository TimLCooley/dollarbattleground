-- CommanderBG player profile (2026-10-22):
-- rank_floor: the rank someone held when ranks were rescaled — never shown lower.
-- officer_since: set by their first purchase (store or Battleground); officers
--   climb their own ladder from 2nd Lieutenant on points earned from then on.
-- skin / custom_colors: the active store skin (store build).
create table if not exists public.commander_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rank_floor text,
  officer_since timestamptz,
  skin text,
  custom_colors jsonb,
  updated_at timestamptz not null default now()
);
alter table public.commander_profile enable row level security;

-- ranks held at the rescale (computed from the first ladder: both Corporal)
insert into public.commander_profile (user_id, rank_floor)
select id, 'cpl' from auth.users where email in ('timlcooley@gmail.com', 'jaredmartin35@gmail.com')
on conflict (user_id) do update set rank_floor = excluded.rank_floor;

-- anyone who already bought on the Battleground is commissioned now
insert into public.commander_profile (user_id, officer_since)
select user_id, now() from public.player_stats where spent_cents > 0
on conflict (user_id) do update set officer_since = coalesce(public.commander_profile.officer_since, excluded.officer_since);
