-- Boosted drops: while a player's boost runs, opening the game always drops.
-- New players get 3 days from joining; everyone existing starts 3 days now (Tim, 2026-10-12).
alter table public.free_claims add column if not exists drop_boost_until timestamptz;
update public.free_claims set drop_boost_until = now() + interval '3 days';
create or replace function public.free_claims_drop_boost()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.drop_boost_until is null then new.drop_boost_until := now() + interval '3 days'; end if;
  return new;
end $$;
drop trigger if exists free_claims_drop_boost on public.free_claims;
create trigger free_claims_drop_boost before insert on public.free_claims for each row execute function public.free_claims_drop_boost();

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.roll_drop(text,text)'::regprocedure);
  v_def := replace(v_def, 'v_chance := case when v_visits <= 3 then 1.0 else 0.20 end;',
    'v_chance := case when v_visits <= 3 or coalesce((select drop_boost_until > now() from public.free_claims where user_id = v_uid), false) then 1.0 else 0.20 end;');
  execute v_def;
end $$;
