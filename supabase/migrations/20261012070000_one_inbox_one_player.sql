-- One inbox, one player (Tim, 2026-10-12): tim+2@gmail.com and t.i.m@gmail.com
-- are the same inbox as tim@gmail.com. Compare a normalized form — lowercase,
-- drop "+anything", and for Gmail drop dots — and refuse a second free square
-- for an inbox that already has one.
create or replace function public.normalize_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then lower(p_email)
    else (
      with parts as (
        select split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1) as local,
               split_part(lower(trim(p_email)), '@', 2) as domain
      )
      select case when domain in ('gmail.com', 'googlemail.com')
                  then replace(local, '.', '') || '@gmail.com'
                  else local || '@' || domain end
      from parts
    )
  end
$$;

create or replace function public.inbox_already_enlisted(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.free_claims f join auth.users u on u.id = f.user_id
     where public.normalize_email(u.email) = public.normalize_email(p_email)
  );
$$;
revoke all on function public.inbox_already_enlisted(text) from public, anon, authenticated;
grant execute on function public.inbox_already_enlisted(text) to service_role;

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.claim_free_tile(integer,integer,text)'::regprocedure);
  if position('same inbox' in v_def) = 0 then
    v_def := replace(v_def,
      '  if exists (select 1 from public.free_claims where user_id = v_uid) then raise exception ''free tile already used''; end if;',
      '  if exists (select 1 from public.free_claims where user_id = v_uid) then raise exception ''free tile already used''; end if;
  -- the same inbox under another address (+tags, Gmail dots) already enlisted
  if exists (select 1 from public.free_claims f join auth.users u on u.id = f.user_id
              where f.user_id <> v_uid
                and public.normalize_email(u.email) = public.normalize_email((select email from auth.users where id = v_uid))) then
    raise exception ''this inbox already has a player — sign in with your original address'';
  end if;');
    execute v_def;
  end if;
end $$;

select public.normalize_email('T.I.M+battle2@GMail.com') as gmail_example, public.normalize_email('jack+x@yahoo.com') as other_example;

-- exact-address lookup, so the original address can still sign back in
create or replace function public.emails_for_lookup_exact(p_email text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.free_claims f join auth.users u on u.id=f.user_id where lower(u.email)=lower(trim(p_email)))
$$;
revoke all on function public.emails_for_lookup_exact(text) from public, anon, authenticated;
grant execute on function public.emails_for_lookup_exact(text) to service_role;
