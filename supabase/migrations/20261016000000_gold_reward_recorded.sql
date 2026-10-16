-- Record what a gold square actually paid (a leading side's gold pays a 2×2,
-- otherwise a 3×3) so the board announces the real reward.
alter table public.gold_squares add column if not exists reward text;
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.tiles_gold_claim'::regproc);
  v_def := replace(v_def,
    'if public.side_share(new.team) > 0.60 then perform public.credit_bank(new.owner_id, 0, 1, 0); else perform public.credit_bank(new.owner_id, 0, 0, 1); end if;',
    'if public.side_share(new.team) > 0.60 then
      perform public.credit_bank(new.owner_id, 0, 1, 0);
      update public.gold_squares set reward = ''2x2'' where id = v_id;
    else
      perform public.credit_bank(new.owner_id, 0, 0, 1);
      update public.gold_squares set reward = ''3x3'' where id = v_id;
    end if;');
  v_def := replace(v_def, '''+3×3''', 'case when public.side_share(new.team) > 0.60 then ''+2×2'' else ''+3×3'' end');
  execute v_def;
end $$;
update public.gold_squares set reward = '2x2' where id = 35;
-- the activity line says what was paid, too
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.tiles_gold_claim'::regproc);
  v_def := replace(v_def, ''') — +3×3''', ''') — '' || case when public.side_share(new.team) > 0.60 then ''+2×2'' else ''+3×3'' end');
  execute v_def;
end $$;
