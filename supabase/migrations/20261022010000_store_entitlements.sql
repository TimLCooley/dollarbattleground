-- CommanderBG store: what each player owns. Written only by the server after
-- Stripe confirms payment (webhook or the checkout return), one row per item.
create table if not exists public.store_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null,
  payment_intent text,
  amount_cents int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, item)
);
alter table public.store_entitlements enable row level security;
