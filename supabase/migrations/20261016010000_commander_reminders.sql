-- "Remind me tomorrow" for /commander: one row per inbox; the autopilot emails
-- each active row once a day when the new puzzle is live.
create table if not exists public.commander_reminders (
  id bigint generated always as identity primary key,
  email text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  token uuid not null default gen_random_uuid(), -- for the unsubscribe link
  active boolean not null default true,
  last_sent_day int,
  created_at timestamptz not null default now()
);
alter table public.commander_reminders enable row level security; -- server only
