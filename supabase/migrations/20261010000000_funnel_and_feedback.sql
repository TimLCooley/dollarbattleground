-- Funnel: the steps a real person takes, one row per (session, step), so the
-- scoreboard can say "212 opened it, 40 tapped a square, 6 entered an email".
-- Feedback: what players tell us from the in-game button.
create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  user_id uuid,
  step text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, step)
);
create index if not exists funnel_events_created on public.funnel_events (created_at);
alter table public.funnel_events enable row level security;

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  side text,
  message text not null,
  page text,
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;

create or replace function public.track(p_session text, p_step text, p_meta jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_step not in ('board_open','square_tap','side_pick','email_entered','code_verified','first_move','feedback_open')
     or p_session is null or length(p_session) < 8 or length(p_session) > 64 then
    return;
  end if;
  insert into public.funnel_events (session_id, user_id, step, meta)
  values (p_session, auth.uid(), p_step, p_meta)
  on conflict (session_id, step) do nothing;
end $$;
revoke all on function public.track(text, text, jsonb) from public;
grant execute on function public.track(text, text, jsonb) to anon, authenticated;

create or replace function public.send_feedback(p_message text, p_email text default null, p_side text default null, p_page text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_email text := coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = auth.uid() and not is_anonymous));
begin
  if p_message is null or length(trim(p_message)) < 2 or length(p_message) > 4000 then raise exception 'empty feedback'; end if;
  insert into public.feedback (user_id, email, side, message, page) values (auth.uid(), v_email, p_side, trim(p_message), left(p_page, 200));
  insert into public.activity (kind, faction, summary)
  values ('feedback', p_side, left('Feedback' || coalesce(' from ' || v_email, '') || ': ' || trim(p_message), 300));
end $$;
revoke all on function public.send_feedback(text, text, text, text) from public;
grant execute on function public.send_feedback(text, text, text, text) to anon, authenticated;
