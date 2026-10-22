-- Skin shuffle: when on, each game load picks a random skin from skin_pool
-- (the skins switched on in the store); when off, the single skin is used.
alter table public.commander_profile add column if not exists shuffle boolean not null default false;
alter table public.commander_profile add column if not exists skin_pool text[] not null default '{}';
