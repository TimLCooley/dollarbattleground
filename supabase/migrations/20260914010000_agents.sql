-- Agents: the AI game-masters (SOW / Board Manager / future custom). The admin
-- panel is their home base — personalities, visuals, config, on/off — and
-- agent_events logs what they do. Public read (the game shows them); writes via
-- service role from the admin panel.

create table if not exists public.agents (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  role        text not null default 'custom',
  personality text,                          -- persona / system prompt
  avatar      text,                          -- emoji or sprite key
  color       text,                          -- hex accent
  active      boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.agents enable row level security;

create policy "agents_public_read"
  on public.agents for select to anon, authenticated using (true);

create table if not exists public.agent_events (
  id         bigint generated always as identity primary key,
  agent_slug text not null,
  kind       text not null,                  -- 'message' | 'action' | 'system'
  summary    text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_events_recent
  on public.agent_events (created_at desc);
alter table public.agent_events enable row level security;
-- No client policies: only the service role (admin panel / agent runtime) reads
-- and writes the log.

insert into public.agents (slug, name, role, personality, avatar, color) values
  ('sow', 'The Sergeant', 'sow',
   'A relentless drill sergeant who provokes players to spend and hold the line. Blunt, urgent, a little theatrical — never lets the player rest.',
   '🎖️', '#f2c14e'),
  ('board_manager', 'Field Command', 'board_manager',
   'The cool tactician narrating the battle. Surfaces dramatic stats, takeovers, and momentum swings to stoke FOMO and pull players back in.',
   '📡', '#356fd0')
on conflict (slug) do nothing;
