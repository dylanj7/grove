-- Phase 4 — The Body. Run once in the Supabase SQL editor.
-- Additive and idempotent: safe to run on the live database as-is.
--
-- It does three things:
--   1. records provenance on each physical reading (manual now, fitbit later),
--   2. guarantees one reading per (user, day) so manual input UPSERTs cleanly,
--   3. prepares — but leaves empty — the Fitbit token storage Phase 5 will wire.

-- 1. Provenance. Existing rows (and the seed) default to 'manual'.
alter table public.physical_days
  add column if not exists source text not null default 'manual';

-- 2. The upsert target for manual input (and later Fitbit sync). One row per
--    (user, day). Fails only if duplicate (user_id, day) rows already exist —
--    they don't: the seed writes one row per day and nothing else writes yet.
create unique index if not exists physical_days_user_day_key
  on public.physical_days (user_id, day);

-- 3. Fitbit token storage — PREPARED, left empty. Phase 5 drops OAuth + token
--    refresh behind the lib/fitbit.ts seam and writes here; nothing reads it yet.
create table if not exists public.fitbit_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  fitbit_user_id text,
  access_token   text,
  refresh_token  text,
  scope          text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.fitbit_connections enable row level security;

-- Own-rows only, matching the rest of the schema.
drop policy if exists "own fitbit connection" on public.fitbit_connections;
create policy "own fitbit connection" on public.fitbit_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
