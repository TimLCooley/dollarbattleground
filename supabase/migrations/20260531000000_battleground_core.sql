-- Dollar Battleground core: factions, anonymous wallets, the 10x10 board,
-- the transaction ledger, and the live feed.
-- Play-money economy: 1 credit = $1. All writes go through SECURITY DEFINER
-- RPCs so pricing/rules stay server-side and swappable for Stripe later.

-- ---------- private schema (holds SECURITY DEFINER trigger fns) ----------
create schema if not exists private;
revoke all on schema private from anon, authenticated, public;

-- ---------- factions (extensible; launch with two) ----------
create table public.factions (
  key        text primary key,
  name       text not null,
  color      text not null,
  cause      text,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

insert into public.factions (key, name, color, sort) values
  ('democrat',   'Democrat',   '#1d4ed8', 1),
  ('republican', 'Republican', '#dc2626', 2);

-- ---------- wallets (one per anonymous auth user) ----------
create table public.wallets (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  balance_credits int not null default 25,
  updated_at      timestamptz not null default now()
);

-- ---------- the board: fixed 10x10, pre-seeded with 100 empty cells ----------
create table public.cells (
  x               int not null check (x between 0 and 9),
  y               int not null check (y between 0 and 9),
  faction_key     text references public.factions(key),
  owner_id        uuid references auth.users(id) on delete set null,
  fortified_until timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (x, y)
);

insert into public.cells (x, y)
select gx, gy from generate_series(0, 9) as gx, generate_series(0, 9) as gy;

-- ---------- ledger ----------
create table public.transactions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  x            int not null,
  y            int not null,
  action       text not null check (action in ('deploy', 'annex', 'reinforce', 'fortify')),
  faction_key  text references public.factions(key),
  cost_credits int not null,
  created_at   timestamptz not null default now()
);

-- ---------- feed (seed of the Secretary of War output) ----------
create table public.feed (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  source      text not null default 'system'
              check (source in ('system', 'sow', 'board_manager')),
  kind        text not null default 'claim'
              check (kind in ('claim', 'breach', 'intel')),
  faction_key text references public.factions(key),
  color       text,
  text        text not null,
  meta        jsonb not null default '{}'::jsonb
);

-- ---------- RLS ----------
alter table public.factions     enable row level security;
alter table public.wallets      enable row level security;
alter table public.cells        enable row level security;
alter table public.transactions enable row level security;
alter table public.feed         enable row level security;

-- public reads (board, factions, and feed are visible to everyone)
create policy "factions_read" on public.factions
  for select to anon, authenticated using (true);
create policy "cells_read" on public.cells
  for select to anon, authenticated using (true);
create policy "feed_read" on public.feed
  for select to anon, authenticated using (true);

-- private reads (own wallet + own ledger only)
create policy "wallets_read_own" on public.wallets
  for select to anon, authenticated using ((select auth.uid()) = user_id);
create policy "transactions_read_own" on public.transactions
  for select to anon, authenticated using ((select auth.uid()) = user_id);

-- NOTE: no client write policies. All mutations go through claim_cell().

-- ---------- give every new (anonymous) user a wallet ----------
create or replace function private.handle_new_user_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user_wallet() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute function private.handle_new_user_wallet();

-- ---------- the claim RPC: deploy / reinforce / annex, atomically ----------
create or replace function public.claim_cell(p_x int, p_y int, p_faction_key text)
returns public.cells
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user         uuid := (select auth.uid());
  v_cost         int  := 1;
  v_faction      public.factions;
  v_prev_faction public.factions;
  v_cell         public.cells;
  v_action       text;
  v_text         text;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select * into v_faction from public.factions where key = p_faction_key;
  if not found then
    raise exception 'unknown faction %', p_faction_key;
  end if;

  -- lock the target cell
  select * into v_cell from public.cells where x = p_x and y = p_y for update;
  if not found then
    raise exception 'no such cell %,%', p_x, p_y;
  end if;

  -- fortified by someone else?
  if v_cell.fortified_until is not null
     and v_cell.fortified_until > now()
     and v_cell.owner_id is distinct from v_user then
    raise exception 'cell fortified';
  end if;

  -- classify the move (drives feed wording + ledger)
  if v_cell.owner_id is null then
    v_action := 'deploy';
  elsif v_cell.faction_key = p_faction_key then
    v_action := 'reinforce';
  else
    v_action := 'annex';
    select * into v_prev_faction from public.factions where key = v_cell.faction_key;
  end if;

  -- debit wallet (row lock + balance guard in one statement)
  update public.wallets
     set balance_credits = balance_credits - v_cost,
         updated_at = now()
   where user_id = v_user and balance_credits >= v_cost;
  if not found then
    raise exception 'insufficient credits';
  end if;

  -- apply the claim
  update public.cells
     set faction_key = p_faction_key,
         owner_id = v_user,
         updated_at = now()
   where x = p_x and y = p_y
   returning * into v_cell;

  insert into public.transactions (user_id, x, y, action, faction_key, cost_credits)
  values (v_user, p_x, p_y, v_action, p_faction_key, v_cost);

  v_text := case v_action
    when 'deploy'    then v_faction.name || 's deployed to grid ' || p_x || '-' || p_y || '.'
    when 'reinforce' then v_faction.name || 's reinforced grid ' || p_x || '-' || p_y || '.'
    else v_faction.name || 's annexed grid ' || p_x || '-' || p_y
         || ' from the ' || coalesce(v_prev_faction.name, 'Independent') || 's.'
  end;

  insert into public.feed (source, kind, faction_key, color, text)
  values ('system',
          case when v_action = 'annex' then 'breach' else 'claim' end,
          p_faction_key, v_faction.color, v_text);

  return v_cell;
end;
$$;

grant execute on function public.claim_cell(int, int, text) to anon, authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.cells;
alter publication supabase_realtime add table public.feed;
alter publication supabase_realtime add table public.wallets;
