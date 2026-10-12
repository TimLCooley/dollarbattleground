-- Gold squares (Tim, 2026-10-12): a few times a day a random square glows
-- gold; whoever takes it first gets a free 3×3. Taking it = any claim that
-- changes the tile's owner while the gold is live (free, banked or paid).
create table if not exists public.gold_squares (
  id bigint generated always as identity primary key,
  x int not null,
  y int not null,
  spawned_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_by uuid,
  claimed_side text,
  claimed_at timestamptz
);
create index if not exists gold_squares_live on public.gold_squares (expires_at) where claimed_at is null;
alter table public.gold_squares enable row level security;
drop policy if exists gold_squares_read on public.gold_squares;
create policy gold_squares_read on public.gold_squares for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.gold_squares;

-- Spawn one (server-only): a random square, live for p_minutes. One at a time.
create or replace function public.spawn_gold_square(p_minutes int default 45)
returns public.gold_squares language plpgsql security definer set search_path = '' as $$
declare v public.gold_squares;
begin
  if exists (select 1 from public.gold_squares where claimed_at is null and expires_at > now()) then
    select * into v from public.gold_squares where claimed_at is null and expires_at > now() limit 1;
    return v;
  end if;
  insert into public.gold_squares (x, y, expires_at)
  values (floor(random() * 15)::int, floor(random() * 15)::int, now() + make_interval(mins => p_minutes))
  returning * into v;
  return v;
end $$;
revoke all on function public.spawn_gold_square(int) from public, anon, authenticated;
grant execute on function public.spawn_gold_square(int) to service_role;

-- Taking it: when a live gold square's tile gets a new owner, that owner wins.
create or replace function public.tiles_gold_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if new.owner_id is null or new.owner_id is not distinct from old.owner_id then return new; end if;
  update public.gold_squares set claimed_by = new.owner_id, claimed_side = new.team, claimed_at = now()
   where x = new.x and y = new.y and claimed_at is null and expires_at > now()
  returning id into v_id;
  if v_id is not null then
    perform public.credit_bank(new.owner_id, 0, 0, 1);
    insert into public.activity (kind, actor, faction, summary, meta)
    values ('gold_square', new.owner_id, new.team, initcap(coalesce(new.team, '?')) || ' took the gold square (' || new.x || ',' || new.y || ') — +3×3',
            jsonb_build_object('gold_id', v_id, 'x', new.x, 'y', new.y));
  end if;
  return new;
end $$;
drop trigger if exists tiles_gold_claim on public.tiles;
create trigger tiles_gold_claim after update on public.tiles for each row execute function public.tiles_gold_claim();
