-- Founding Officers get more than one tile: on commission they're banked a
-- free 2×2 block and a free single (flip_bank), placed with the FREE tool.
create or replace function public.free_claims_founding_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.founding_officer then
    perform public.credit_bank(new.user_id, 1, 1);
  end if;
  return new;
end $$;
drop trigger if exists free_claims_founding_bonus on public.free_claims;
create trigger free_claims_founding_bonus after insert on public.free_claims
  for each row execute function public.free_claims_founding_bonus();

-- the founding officers who signed up before this existed
select public.credit_bank(user_id, 1, 1) from public.free_claims
 where founding_officer and user_id not in (select user_id from public.flip_bank);
