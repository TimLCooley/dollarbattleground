-- my_status also tells the app the player's side, join time and squares taken,
-- so a signed-in player on a fresh browser (or the admin's view-as) lands on
-- their own board instead of the enlist screen.
create or replace function public.my_status()
returns json language sql security definer set search_path = '' stable as $$
  select json_build_object(
    'founding_officer', coalesce((select founding_officer from public.free_claims where user_id = auth.uid()), false),
    'founding_number', (select count(*) from public.free_claims f2 where f2.founding_officer and f2.created_at <= (select created_at from public.free_claims where user_id = auth.uid())),
    'paid_officer', coalesce((select spent_cents >= 500 from public.player_stats where user_id = auth.uid()), false),
    'founding_open', greatest(0, 100 - (select count(*) from public.free_claims where founding_officer)),
    'side', (select side from public.free_claims where user_id = auth.uid()),
    'joined', (select created_at from public.free_claims where user_id = auth.uid()),
    'captures', (select count(*) from public.tile_events where owner_id = auth.uid())
  );
$$;
