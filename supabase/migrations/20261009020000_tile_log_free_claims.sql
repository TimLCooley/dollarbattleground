-- The tile log only recorded paid claims (claim_paid writes tile_events
-- itself), so free first positions and starter-kit pieces showed the old
-- paid owner. Free/banked claims now log too, via a trigger keyed on a
-- per-transaction setting those two functions set.
create or replace function public.tiles_log_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_src text := nullif(current_setting('app.tile_source', true), '');
begin
  if v_src is not null and (new.team is distinct from old.team or new.owner_id is distinct from old.owner_id) then
    insert into public.tile_events (x, y, team, owner_id, source) values (new.x, new.y, new.team, new.owner_id, v_src);
  end if;
  return new;
end $$;
drop trigger if exists tiles_log_claim on public.tiles;
create trigger tiles_log_claim after update on public.tiles for each row execute function public.tiles_log_claim();

create or replace function public.claim_free_tile(p_x int, p_y int, p_team text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team not in ('red', 'blue') then raise exception 'invalid team %', p_team; end if;
  if p_x < 0 or p_x > 14 or p_y < 0 or p_y > 14 then raise exception 'out of range'; end if;
  begin
    insert into public.free_claims (user_id, side) values (v_uid, p_team);
  exception when unique_violation then
    raise exception 'free tile already used';
  end;
  perform set_config('app.tile_source', 'free', true);
  update public.tiles set team = p_team, owner_id = v_uid, updated_at = now() where x = p_x and y = p_y;
end $$;

-- claim_banked: tag its updates as starter-kit placements
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.claim_banked'::regproc);
  if position('app.tile_source' in v_def) = 0 then
    v_def := replace(v_def, '  get diagnostics v_rows = row_count;
  if v_rows = 0 then return -1; end if;',
      '  get diagnostics v_rows = row_count;
  if v_rows = 0 then return -1; end if;
  perform set_config(''app.tile_source'', ''starter kit'', true);');
    execute v_def;
  end if;
end $$;

-- backfill: tiles currently held by free/starter-kit players that the log never saw
insert into public.tile_events (x, y, team, owner_id, source, created_at)
select t.x, t.y, t.team, t.owner_id, 'free / starter kit', t.updated_at
  from public.tiles t
 where t.owner_id in (select user_id from public.free_claims)
   and not exists (select 1 from public.tile_events e where e.x = t.x and e.y = t.y and e.owner_id = t.owner_id and e.created_at >= t.updated_at - interval '1 second');
