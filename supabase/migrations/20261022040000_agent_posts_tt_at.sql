-- When a clip also went to TikTok (capped at 2 a day — TikTok stopped
-- recommending the account when it posted 7 a day).
alter table public.agent_posts add column if not exists tt_at timestamptz;
create index if not exists agent_posts_tt_at on public.agent_posts (tt_at) where tt_at is not null;
-- the last 24 hours already sent to TikTok
update public.agent_posts set tt_at = posted_at where tt_at is null and tiktok_post_id is not null and posted_at > now() - interval '24 hours';
