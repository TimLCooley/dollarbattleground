-- "Share my path": a short link to a player's submitted layout for one day.
-- The layout itself stays in commander_scores; the API only hands it to
-- someone who has posted their own score for that day (no spoilers).
create table if not exists public.commander_shares (
  id text primary key,
  day int not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (day, user_id)
);
alter table public.commander_shares enable row level security;
