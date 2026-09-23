-- The Recruiter agent's post queue — DENY-ONLY model. The agent drafts + schedules
-- posts into time slots (status 'queued' = accepted by default). The Commander
-- reviews and can DENY any post; a deny requires a reason (training signal) and
-- the agent drafts a REPLACEMENT for that same slot. A queued post publishes to X
-- at its slot unless denied first. Admin/service-role only — no client access.

create table if not exists public.agent_posts (
  id           bigint generated always as identity primary key,
  agent        text not null default 'recruiter',
  goal         text,                                 -- the goal this post serves
  status       text not null default 'queued',       -- queued | denied | posted | failed
  format       text not null default 'text',         -- text | image | video
  network      text,                                 -- 'red' | 'blue' | null
  x_account    text,                                 -- which handle posts it
  copy         text not null,                         -- the tweet text
  video_kind   text,                                 -- 'coming_soon' | 'social_clip' | null
  video_spec   jsonb,                                 -- Remotion props when format=video
  media_url    text,                                  -- rendered mp4 once produced
  reason       text,                                  -- why the agent chose this (for review)
  scheduled_for timestamptz,                          -- the slot it will post at
  deny_reason  text,                                  -- Commander's reason on deny → trains the agent
  replaces     bigint references public.agent_posts(id), -- the denied post this fills in for
  external_id  text,                                  -- tweet id once posted
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,                            -- when denied
  posted_at    timestamptz
);

create index if not exists agent_posts_status on public.agent_posts (status, scheduled_for);
alter table public.agent_posts enable row level security;
-- No policies: the agent + admin act via the service role.
-- The brain reads recent `deny_reason`s to learn what to avoid.
