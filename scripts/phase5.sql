-- Phase 5 — The Band (Google Health). Run once in the Supabase SQL editor.
-- Additive and idempotent: safe to run on the live database, and safe to re-run.
--
-- It does three things:
--   1. renames the dark fitbit_connections token table to the provider-neutral
--      health_connections, and gives it the fields Google OAuth needs,
--   2. lets a physical reading carry a provider source ('google_health') and
--      keeps manual + provider readings as SEPARATE rows per day, so provider
--      data can supersede manual per-metric without discarding manual entries,
--   3. leaves everything else (recovery, the brief) untouched — they read the
--      merged reading and never learn where a number came from.

-- ============================================================================
-- 1. The token store: fitbit_connections -> health_connections.
-- The provider is Google Health now (data still originates from Fitbit/Pixel),
-- so the table goes provider-neutral. Rename is guarded so a re-run is a no-op.
-- ============================================================================
do $$
begin
  if to_regclass('public.fitbit_connections') is not null
     and to_regclass('public.health_connections') is null then
    alter table public.fitbit_connections rename to health_connections;
  end if;
end $$;

-- If neither table exists yet (a fresh database), create the neutral one.
create table if not exists public.health_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  fitbit_user_id text,            -- the provider user id from users.getIdentity
  access_token   text,
  refresh_token  text,
  scope          text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Additive fields Phase 5 needs (each guarded — safe on the renamed table too):
--   provider        — which provider issued these tokens (future-proofs a swap),
--   oauth_state     — the CSRF state for an in-flight connect, verified on callback,
--   oauth_state_at  — when that state was minted (so a stale handshake can expire),
--   needs_reconnect — set when a refresh is rejected (revoked / no refresh token),
--                     so Settings can prompt calmly without calling Google to ask.
alter table public.health_connections
  add column if not exists provider        text not null default 'google_health';
alter table public.health_connections
  add column if not exists oauth_state      text;
alter table public.health_connections
  add column if not exists oauth_state_at   timestamptz;
alter table public.health_connections
  add column if not exists needs_reconnect  boolean not null default false;

alter table public.health_connections enable row level security;

-- Own-rows only, matching the rest of the schema. Recreate under a neutral name
-- (drop both the old and new policy names so a re-run lands clean).
drop policy if exists "own fitbit connection"  on public.health_connections;
drop policy if exists "own health connection"  on public.health_connections;
create policy "own health connection" on public.health_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================
-- 2. physical_days: one row per (user, day, SOURCE), not per (user, day).
-- Manual input and the band are two provenance streams for the same day. Keeping
-- them in separate rows is what lets the window merge them with provider-over-
-- manual precedence PER METRIC — the band supersedes a manual number it covers,
-- while a manual metric the band doesn't cover survives (lib/window.ts).
-- Existing rows are all source 'manual' (Phase 4), so the new key holds cleanly.
-- ============================================================================
-- Drop the old one-row-per-day uniqueness WHATEVER ITS FORM OR NAME — the same
-- name-agnostic discipline phase4_5.sql used for checkins. The original table
-- carried an inline unique(user_id, day) (auto-named physical_days_user_id_day
-- _key), which the first cut of this migration missed: it dropped only the
-- phase-4 index name, so the two-column uniqueness survived and every band
-- upsert aborted the moment a day already held a manual row.
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.physical_days'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = any(con.conkey)
      ) = array['day', 'user_id']
  loop
    execute format('alter table public.physical_days drop constraint %I', rec.conname);
  end loop;
end $$;

-- Belt-and-suspenders for bare unique indexes under either historical name.
drop index if exists public.physical_days_user_id_day_key;
drop index if exists public.physical_days_user_day_key;

create unique index if not exists physical_days_user_day_source_key
  on public.physical_days (user_id, day, source);
