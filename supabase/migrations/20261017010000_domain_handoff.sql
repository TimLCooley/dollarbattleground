-- Moving domains without signing anyone out: the old domain parks a visitor's
-- session (and their bg_* browser data) under a one-time code; commanderbg.com
-- claims it within 2 minutes and signs them back in. Server-only table.
create table if not exists public.domain_handoffs (
  code text primary key,
  access_token text,
  refresh_token text,
  local jsonb,
  to_path text not null default '/',
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table public.domain_handoffs enable row level security; -- no policies: service role only

-- Claim atomically: returns the parked tokens/data once, then wipes them.
create or replace function public.claim_domain_handoff(p_code text)
returns table (access_token text, refresh_token text, local jsonb, to_path text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with c as (
    select h.code, h.access_token, h.refresh_token, h.local, h.to_path
      from public.domain_handoffs h
     where h.code = p_code and h.used_at is null and h.created_at > now() - interval '2 minutes'
     for update
  ), u as (
    update public.domain_handoffs h set used_at = now(), access_token = null, refresh_token = null
      from c where h.code = c.code
    returning 1
  )
  select c.access_token, c.refresh_token, c.local, c.to_path from c, u;
  -- tidy up anything older than a day
  delete from public.domain_handoffs where created_at < now() - interval '1 day';
end $$;
revoke all on function public.claim_domain_handoff(text) from public, anon, authenticated;
grant execute on function public.claim_domain_handoff(text) to service_role;
