-- /commander: the daily war puzzle (one map a day, one submission, exact optimum).
create table if not exists public.commander_days (
  day int primary key,
  layout jsonb not null,
  optimal int not null,
  solution jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.commander_days enable row level security; -- server only (solution stays hidden)

create table if not exists public.commander_scores (
  day int not null references public.commander_days(day),
  user_id uuid not null references auth.users(id) on delete cascade,
  side text not null,
  placements jsonb not null,
  score int not null,
  medal text,
  reward text,
  created_at timestamptz not null default now(),
  primary key (day, user_id)
);
alter table public.commander_scores enable row level security;
drop policy if exists commander_scores_own on public.commander_scores;
create policy commander_scores_own on public.commander_scores for select to authenticated using (user_id = auth.uid());

-- public: the day's score histogram only
create or replace function public.commander_histogram(p_day int)
returns table (score int, players int) language sql stable security definer set search_path = '' as $$
  select s.score, count(*)::int from public.commander_scores s where s.day = p_day group by s.score order by s.score;
$$;
grant execute on function public.commander_histogram(int) to anon, authenticated;

-- funnel steps for the puzzle
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.track'::regproc);
  v_def := replace(v_def, '''feedback_open'')', '''feedback_open'',''commander_open'',''commander_submit'',''commander_share'')');
  execute v_def;
end $$;
