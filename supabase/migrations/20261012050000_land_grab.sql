-- Land grab (Tim, 2026-10-12): most of the map has never been claimed by a
-- player. Push people onto open ground:
--  * drops land on never-claimed squares first;
--  * taking a never-claimed square pays a 1×1 back half the time ("finder's bonus").
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.roll_drop(text,text)'::regprocedure);
  v_def := replace(v_def, 'order by (t.team is distinct from v_side) desc, random() limit 1;',
                          'order by (t.owner_id is null) desc, (t.team is distinct from v_side) desc, random() limit 1;');
  execute v_def;
end $$;

create table if not exists public.land_grab_awards (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  x int not null,
  y int not null,
  created_at timestamptz not null default now()
);
alter table public.land_grab_awards enable row level security;
drop policy if exists land_grab_own on public.land_grab_awards;
create policy land_grab_own on public.land_grab_awards for select to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table public.land_grab_awards;

create or replace function public.tiles_land_grab()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.owner_id is null and new.owner_id is not null and random() < 0.5 then
    perform public.credit_bank(new.owner_id, 1, 0, 0);
    insert into public.land_grab_awards (user_id, x, y) values (new.owner_id, new.x, new.y);
  end if;
  return new;
end $$;
drop trigger if exists tiles_land_grab on public.tiles;
create trigger tiles_land_grab after update on public.tiles for each row execute function public.tiles_land_grab();

-- public count of open ground for the board's banner
create or replace function public.open_ground()
returns integer language sql security definer set search_path = '' stable as $$
  select count(*)::int from public.tiles where owner_id is null;
$$;
grant execute on function public.open_ground() to anon, authenticated;
