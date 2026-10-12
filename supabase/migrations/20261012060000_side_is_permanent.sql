-- "No switching sides" enforced on the server (Tim, 2026-10-12): a fresh or
-- incognito browser forgets the player's side and offers the side picker
-- again; the server now ignores whatever side the browser sends and uses the
-- side the player enlisted with. Anonymous sessions can't take the free square.
create or replace function public.claim_free_tile(p_x int, p_y int, p_team text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'verify your email first'; end if;
  if p_team not in ('red', 'blue') then raise exception 'invalid team %', p_team; end if;
  if p_x < 0 or p_x > 14 or p_y < 0 or p_y > 14 then raise exception 'out of range'; end if;
  if exists (select 1 from public.free_claims where user_id = v_uid) then raise exception 'free tile already used'; end if;
  begin
    insert into public.free_claims (user_id, side) values (v_uid, p_team);
  exception when unique_violation then
    raise exception 'free tile already used';
  end;
  perform set_config('app.tile_source', 'free', true);
  update public.tiles set team = p_team, owner_id = v_uid, updated_at = now() where x = p_x and y = p_y;
end $$;

-- banked pieces always paint the player's own side
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.claim_banked'::regproc);
  if position('enlisted side wins' in v_def) = 0 then
    v_def := replace(v_def, '  if p_team not in (''red'',''blue'') then raise exception ''invalid team %'', p_team; end if;',
      '  if p_team not in (''red'',''blue'') then raise exception ''invalid team %'', p_team; end if;
  -- enlisted side wins over whatever the browser sent
  p_team := coalesce((select side from public.free_claims where user_id = v_uid), p_team);');
    execute v_def;
  end if;
end $$;

-- paid moves too (Stripe metadata carries the side the browser chose)
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.claim_paid'::regproc);
  if position('enlisted side wins' in v_def) = 0 then
    v_def := replace(v_def, '  if p_team not in (''red'', ''blue'') then
    raise exception ''invalid team %'', p_team;
  end if;',
      '  if p_team not in (''red'', ''blue'') then
    raise exception ''invalid team %'', p_team;
  end if;
  -- enlisted side wins over whatever the browser sent
  p_team := coalesce((select side from public.free_claims where user_id = p_owner), p_team);');
    execute v_def;
  end if;
end $$;
