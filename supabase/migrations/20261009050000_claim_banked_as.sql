-- Admin "view / play as": place a player's banked pieces for them without
-- switching accounts. Server-only (service_role): runs claim_banked with the
-- player's id as the caller, so ownership, the bank and the tile log are theirs.
create or replace function public.claim_banked_as(p_uid uuid, p_center integer, p_kind text, p_team text)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  return public.claim_banked(p_center, p_kind, p_team);
end $$;
revoke all on function public.claim_banked_as(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.claim_banked_as(uuid, integer, text, text) to service_role;
