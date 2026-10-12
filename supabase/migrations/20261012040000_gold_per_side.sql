-- Gold per side (Tim, 2026-10-12): each drop spawns a Red gold on Blue-held
-- ground and a Blue gold on Red-held ground. Only that side sees its gold and
-- only that side can earn it — by capturing the square from the enemy.
alter table public.gold_squares add column if not exists side text;
update public.gold_squares set expires_at = now() where claimed_at is null and expires_at > now() and side is null;

drop function if exists public.spawn_gold_square(int);
create or replace function public.spawn_gold_square(p_minutes int default 45)
returns setof public.gold_squares language plpgsql security definer set search_path = '' as $$
declare s text; v_x int; v_y int;
begin
  foreach s in array array['red','blue'] loop
    if exists (select 1 from public.gold_squares g where g.side = s and g.claimed_at is null and g.expires_at > now()) then continue; end if;
    -- on the enemy's ground (fallback: anywhere that isn't already this side's)
    select t.x, t.y into v_x, v_y from public.tiles t
     where t.team = case when s = 'red' then 'blue' else 'red' end
     order by random() limit 1;
    if v_x is null then
      select t.x, t.y into v_x, v_y from public.tiles t where t.team is distinct from s order by random() limit 1;
    end if;
    if v_x is not null then
      insert into public.gold_squares (x, y, side, expires_at) values (v_x, v_y, s, now() + make_interval(mins => p_minutes));
    end if;
    v_x := null; v_y := null;
  end loop;
  return query select * from public.gold_squares g where g.claimed_at is null and g.expires_at > now();
end $$;
revoke all on function public.spawn_gold_square(int) from public, anon, authenticated;
grant execute on function public.spawn_gold_square(int) to service_role;

create or replace function public.tiles_gold_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if new.owner_id is null or new.owner_id is not distinct from old.owner_id then return new; end if;
  update public.gold_squares set claimed_by = new.owner_id, claimed_side = new.team, claimed_at = now()
   where x = new.x and y = new.y and side = new.team and claimed_at is null and expires_at > now()
  returning id into v_id;
  if v_id is not null then
    perform public.credit_bank(new.owner_id, 0, 0, 1);
    insert into public.activity (kind, actor, faction, summary, meta)
    values ('gold_square', new.owner_id, new.team, initcap(coalesce(new.team, '?')) || ' captured its gold square (' || new.x || ',' || new.y || ') — +3×3',
            jsonb_build_object('gold_id', v_id, 'x', new.x, 'y', new.y));
  end if;
  return new;
end $$;

select 'spawned: '||string_agg(side||'@'||x||','||y, '  ') from public.spawn_gold_square(45);
