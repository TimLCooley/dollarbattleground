-- A player's first purchase creates their player_stats row, so the trigger
-- logged it only as 'player_new' and the purchase never reached the digest.
create or replace function log_activity_player()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity (kind, actor, faction, summary, meta)
    values ('player_new', new.user_id, new.side,
            'New ' || coalesce(new.side, '?') || ' player claimed a tile',
            jsonb_build_object('user_id', new.user_id));
  end if;
  if new.spent_cents > coalesce(case when tg_op = 'UPDATE' then old.spent_cents end, 0) then
    insert into public.activity (kind, actor, faction, summary, meta)
    values ('purchase', new.user_id, new.side,
            coalesce(initcap(new.side), '?') || ' player spent $' || to_char((new.spent_cents - coalesce(case when tg_op = 'UPDATE' then old.spent_cents end, 0)) / 100.0, 'FM999990.00'),
            jsonb_build_object('user_id', new.user_id, 'cents', new.spent_cents - coalesce(case when tg_op = 'UPDATE' then old.spent_cents end, 0), 'total_cents', new.spent_cents));
  end if;
  return new;
end $$;
