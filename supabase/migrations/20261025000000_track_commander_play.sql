-- Funnel: "commander_play" = the first troop a browser ever places (a visitor
-- actually playing, signed in or not).
create or replace function public.track(p_session text, p_step text, p_meta jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_step not in ('board_open','square_tap','side_pick','email_entered','code_verified','first_move','feedback_open','commander_open','commander_play','commander_submit','commander_share','store_open','store_checkout','store_purchase')
     or p_session is null or length(p_session) < 8 or length(p_session) > 64 then
    return;
  end if;
  insert into public.funnel_events (session_id, user_id, step, meta)
  values (p_session, auth.uid(), p_step, p_meta)
  on conflict (session_id, step) do nothing;
end $$;
