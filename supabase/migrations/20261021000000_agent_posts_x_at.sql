-- When a clip also went to X (Tim's account allows 5 posts a day; the
-- crosspost leaves X off once 5 have gone out in the last 24 hours).
alter table public.agent_posts add column if not exists x_at timestamptz;
create index if not exists agent_posts_x_at on public.agent_posts (x_at) where x_at is not null;
