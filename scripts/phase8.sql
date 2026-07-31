-- scripts/phase8.sql
-- ---------------------------------------------------------------------------
-- PHASE 8 — Nudges that fire on signal, never on a schedule; and a first day
-- that has something in it.
--
-- Two tables. Neither one stores a message; both exist to make a PROMISE
-- enforceable in code rather than asserted in a settings screen.
--
-- The promise is: "Grove only pings you when something changes, and never more
-- than three times a week." A daily 9am ping is what gets journaling apps
-- deleted, so the cap is not a preference — it is a hard ceiling the sender
-- reads before every send.
--
-- WHY THE CAP LIVES IN POSTGRES. Same reason the Ask cap does (phase6.sql): the
-- sender runs in a serverless function, so an in-memory counter resets to zero
-- on every cold start and the ceiling would silently be "three per instance".
-- A count over nudge_sends is the only version of this that is actually true.
--
-- Run ONCE in the Supabase SQL editor before the new code touches the database,
-- exactly as with phase5/6/7.sql. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- push_subscriptions — where a person's devices can be reached.
--
-- One row per browser/device, not per user: Grove is installed on a phone and
-- may also be open on a laptop, and a Web Push subscription is scoped to the
-- (browser, origin) pair. The endpoint URL is the identity — the push service
-- itself issues it — so it is the natural unique key.
--
-- The keys are the client's own public key and auth secret. They are what the
-- payload is encrypted TO; the server cannot read a delivered notification back
-- out of them, and they are useless to anyone who doesn't also hold the VAPID
-- private key. Still private to their owner under RLS, like everything else.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- Issued by the push service (FCM, Mozilla, Apple). Unique across all users:
  -- if a device is handed over or a profile is switched, the newer owner takes
  -- the endpoint rather than both users pushing to the same browser.
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,

  -- Purely diagnostic — which device is this, roughly. Never parsed for
  -- behavior; it exists so a user disconnecting the right device from a list is
  -- possible later without a schema change.
  user_agent  text,

  -- The device's timezone offset in minutes, exactly as
  -- Date.getTimezoneOffset() reports it (local = UTC − offset).
  --
  -- It lives on the DEVICE row rather than on the profile on purpose. The
  -- sender runs on a fixed UTC schedule and must never ring a phone at 3am, so
  -- it needs to know what time it is WHERE THE PHONE IS — which is a property
  -- of the device, not of the account. A user who travels with one phone and
  -- leaves a laptop at home has two different correct answers, and this is the
  -- only shape that can hold both.
  tz_offset   int,

  created_at  timestamptz not null default now(),
  -- Refreshed every time the browser re-registers. A subscription the push
  -- service has silently dropped is deleted on the 404/410 the send returns, so
  -- this is a health signal, not a garbage-collection input.
  last_seen   timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push subscriptions are private to their owner"
  on public.push_subscriptions;
create policy "push subscriptions are private to their owner"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- nudge_sends — every ping Grove has ever sent, and why.
--
-- Three jobs, and all three are the reason this is durable state:
--
--   1. THE WEEKLY CEILING. count(*) where sent_at > now() - 7 days.
--   2. THE COOLDOWN. A condition like "HRV is under your usual" stays true for
--      days. Without a per-code cooldown the same true fact would fire every
--      night, which is a scheduled notification wearing a detector's clothes.
--   3. THE RECEIPT. `signature` records the exact state that triggered it, so
--      "why did Grove ping me?" has an answer that isn't a guess.
--
-- Rows are written by the cron sender, which runs with the service key and
-- therefore bypasses RLS. The policy below is still enabled and correct: it is
-- what lets the OWNER read their own history from the app (and what stops
-- anyone reading someone else's).
-- ---------------------------------------------------------------------------
create table if not exists public.nudge_sends (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- Which detector fired (lib/nudges.ts). Carries the subject for the
  -- per-goal ones, e.g. 'rhythm_quiet:<uuid>', so two different rhythms going
  -- quiet are two different cooldowns rather than one.
  code        text not null,

  -- The state that made it true, as the detector saw it. Two sends with the
  -- same signature are the same fact stated twice.
  signature   text not null,

  -- Exactly what the person was shown. Kept for the same reason the questions
  -- table keeps answers: a promise about what the app says is only inspectable
  -- if what it said is still there.
  title       text not null,
  body        text not null,

  -- How many devices actually took it. 0 is a real and useful outcome (every
  -- subscription expired) and must not be confused with "not sent".
  delivered   int not null default 0,

  sent_at     timestamptz not null default now()
);

-- Serves both reads the sender makes: the 7-day count and the per-code
-- cooldown lookup, in one index.
create index if not exists nudge_sends_user_sent_idx
  on public.nudge_sends (user_id, sent_at desc);
create index if not exists nudge_sends_user_code_idx
  on public.nudge_sends (user_id, code, sent_at desc);

alter table public.nudge_sends enable row level security;

drop policy if exists "nudge sends are private to their owner" on public.nudge_sends;
create policy "nudge sends are private to their owner"
  on public.nudge_sends
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- profiles — two columns for the cold start.
--
-- The table already exists (the account screen reads display_name from it);
-- `create table if not exists` below is here so this script also works against
-- a fresh database, and the `add column if not exists` statements are the part
-- that actually matters on an existing one. Both are idempotent.
--
-- onboarded_at is the gate. It is checked at the ROOT redirect only — not in
-- the app layout — because the layout renders on every navigation and Grove
-- does not put a query on that path to answer a question that changes once in
-- a user's lifetime. A cookie carries the answer afterwards; the column is the
-- durable truth behind it.
--
-- day_starts_hour is the honest half of "when does your day actually start?".
-- A setup question whose answer changes nothing is a fake question, and this
-- app is not allowed to have those: the answer moves the morning/evening
-- boundary (lib/slot.ts), so someone who starts at 5am gets their evening
-- letter at 4pm rather than being told it's still the morning.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles add column if not exists onboarded_at    timestamptz;
alter table public.profiles add column if not exists day_starts_hour int;

alter table public.profiles enable row level security;

drop policy if exists "profiles are private to their owner" on public.profiles;
create policy "profiles are private to their owner"
  on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
