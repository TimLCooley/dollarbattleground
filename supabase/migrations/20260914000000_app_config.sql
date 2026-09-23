-- App config: small key/value store for runtime settings the admin panel flips
-- (e.g. Stripe test vs live mode). Only the service role reads/writes it (from
-- admin-gated server routes), so RLS is on with no client policies.

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values ('stripe_mode', 'test')
on conflict (key) do nothing;

alter table public.app_config enable row level security;
