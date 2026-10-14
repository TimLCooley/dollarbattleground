-- Bonus balance (2026-10-14): drops + finder's bonus + overlap refunds made
-- every move pay for itself (Jared: 57 moves, 24 drops, 24 squares banked in a
-- day). Rebalance:
--  * placement drops only on a visit's 1st (70%) and 2nd (100%) placement —
--    not every placement after;
--  * at most 3 drops per player per day;
--  * finder's bonus 50% → 20%;
--  * 2×2/3×3 overlap refunds only for squares you already own (no refund for
--    your color's open ground — that's a real gain, not waste).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.roll_drop(text,text)'::regprocedure);
  v_def := replace(v_def,
    'v_chance := case when v_placements >= 2 then 1.0 when v_placements = 1 then 0.70 else 0 end;',
    'v_chance := case when v_placements = 2 then 1.0 when v_placements = 1 then 0.70 else 0 end;');
  v_def := replace(v_def,
    '  -- one live drop at a time',
    '  -- at most 3 drops a day
  if (select count(*) from public.drops where user_id = v_uid and created_at > now() - interval ''24 hours'') >= 3 then return null; end if;
  -- one live drop at a time');
  execute v_def;

  v_def := pg_get_functiondef('public.claim_banked'::regproc);
  v_def := replace(v_def, 'where team = p_team and x between v_x-1 and v_x+1 and y between v_y-1 and v_y+1;',
                          'where owner_id = v_uid and x between v_x-1 and v_x+1 and y between v_y-1 and v_y+1;');
  v_def := replace(v_def, 'where team = p_team and (x, y) in ((v_x0,v_y0),(v_x0+1,v_y0),(v_x0,v_y0+1),(v_x0+1,v_y0+1));',
                          'where owner_id = v_uid and (x, y) in ((v_x0,v_y0),(v_x0+1,v_y0),(v_x0,v_y0+1),(v_x0+1,v_y0+1));');
  execute v_def;

  v_def := pg_get_functiondef('public.tiles_land_grab'::regproc);
  v_def := replace(v_def, 'random() < 0.5', 'random() < 0.2');
  execute v_def;
end $$;
