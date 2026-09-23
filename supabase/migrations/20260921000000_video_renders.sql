-- HeyGen video render log — the budget guard's ledger. Every War Correspondent
-- render is recorded here with its cost, so we can enforce a monthly USD cap and
-- a per-day render cap. Admin/service-role only (no client access).

create table if not exists public.video_renders (
  id          bigint generated always as identity primary key,
  external_id text,                         -- HeyGen video_id
  agent       text,                         -- e.g. 'war-correspondent'
  kind        text,                         -- e.g. 'red-anchor', 'blue-field'
  seconds     numeric,                      -- clip length estimate
  cost_usd    numeric not null default 0,   -- charged/estimated USD
  status      text not null default 'queued', -- queued | processing | done | failed
  created_at  timestamptz not null default now()
);

create index if not exists video_renders_created on public.video_renders (created_at desc);

alter table public.video_renders enable row level security;
-- No policies: only the service-role budget guard reads/writes this table.
