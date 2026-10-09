-- Daily report-in bonus by rank (Tim, 2026-10-09): enlisted get a 1×1,
-- officers (founding or paid) get a 1×1 and a 2×2. Once per MT day, after
-- the day they joined. Returns 0 (nothing), 1 (1×1) or 2 (1×1 + 2×2).
create or replace function public.daily_return()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Denver')::date;
  v_joined date;
  v_officer boolean;
  v_rows int;
begin
  if v_uid is null then return 0; end if;
  select (created_at at time zone 'America/Denver')::date, founding_officer into v_joined, v_officer from public.free_claims where user_id = v_uid;
  if v_joined is null or v_joined >= v_today then return 0; end if;
  v_officer := coalesce(v_officer, false) or coalesce((select spent_cents >= 500 from public.player_stats where user_id = v_uid), false);
  insert into public.flip_bank (user_id, singles, blocks, strikes, last_daily_on)
    values (v_uid, 1, case when v_officer then 1 else 0 end, 0, v_today)
  on conflict (user_id) do update
    set singles = public.flip_bank.singles + 1,
        blocks = public.flip_bank.blocks + case when v_officer then 1 else 0 end,
        last_daily_on = v_today, updated_at = now()
    where public.flip_bank.last_daily_on is distinct from v_today;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 0; end if;
  return case when v_officer then 2 else 1 end;
end $$;

-- today: macdawwg already got the 1×1 → add the officer 2×2; Jared played
-- today but the bonus never fired for him → give him today's officer kit.
update public.flip_bank set blocks = blocks + 1, updated_at = now()
 where user_id = 'ce60b0e4-7fbd-4740-abae-de9d8acb0d16' and last_daily_on = (now() at time zone 'America/Denver')::date;
update public.flip_bank set singles = singles + 1, blocks = blocks + 1, last_daily_on = (now() at time zone 'America/Denver')::date, updated_at = now()
 where user_id = 'ae938e1f-3f85-4d70-83e0-f6bfab9e1cbf' and last_daily_on is distinct from (now() at time zone 'America/Denver')::date;
