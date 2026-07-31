-- scripts/phase7.sql
-- ---------------------------------------------------------------------------
-- PHASE 7 — Intentions become objects.
--
-- Until now the letter's moves were rendered text and nothing more. The letter
-- asked for two things and the app never found out whether either happened, so
-- the loop ran one way: capture → letter → silence. There was no reason to open
-- Grove at 2pm and nothing for the evening letter to close honestly — it could
-- only infer from habit touches that meant something adjacent.
--
-- This table is the other half of that loop. One row per (letter, move) that a
-- person has acted on: tended, or deliberately let go.
--
-- WHY move_key AND NOT AN INDEX. A brief is content-addressed and regenerates
-- when its inputs really change (lib/brief-read.ts), which can reorder or
-- replace moves. An index would then silently re-point a tend at a different
-- intention — the app asserting something the person never did, which is the
-- one thing Grove is not allowed to do. The key is a hash of the move's own
-- aspect + text (lib/intentions.ts), so it survives reordering, and a move whose
-- text actually changed is correctly treated as a different intention.
--
-- WHY 'let_go' IS A STATE AND NOT A DELETE. Releasing something you're not going
-- to do is a real act and the app's voice makes room for it. A deleted row would
-- read as 'open' forever and the letter would keep carrying it forward as though
-- it were still sitting there. Still no penalty language anywhere, and — as
-- everywhere else in Grove — no count, no streak, no grade is derived from this.
--
-- Run ONCE in the Supabase SQL editor before the new code touches the database,
-- exactly as with phase5.sql / phase6.sql. Idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.move_tends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,

  -- The brief this move belongs to: (day, slot) is the brief's own key, so a
  -- move_tend is always attributable to the exact letter that asked for it.
  -- day stays UTC, matching briefs.day — its stable identity.
  day        date not null,
  slot       text not null check (slot in ('morning', 'evening')),

  -- Stable identity of the move within that letter (see above).
  move_key   text not null,

  -- The move as it read when it was acted on. Denormalized on purpose: the
  -- brief can regenerate, and what the person actually agreed to is the text
  -- that was in front of them. Also what the carry-forward line quotes.
  move_text  text not null,
  aspect     text not null,

  state      text not null default 'tended' check (state in ('tended', 'let_go')),

  -- Load-bearing, not bookkeeping. The morning letter's carry-forward counts a
  -- previous move as resolved only if it was resolved BEFORE this brief's day
  -- began — which is what stops tending yesterday's intention at 9am from
  -- changing the morning summary, changing the content signature, and buying a
  -- fresh Opus letter to replace the one already on screen.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The upsert target: one row per move per letter. Tapping a row twice toggles
-- the same row rather than accumulating history — a tend is current state, and
-- a log of taps is exactly the kind of tally this app refuses to keep.
create unique index if not exists move_tends_user_day_slot_key
  on public.move_tends (user_id, day, slot, move_key);

-- Serves both reads: "this letter's states" and "the previous letter's states",
-- which are the only two queries this table has.
create index if not exists move_tends_user_day_idx
  on public.move_tends (user_id, day desc, slot);

alter table public.move_tends enable row level security;

-- RLS is the real boundary, same as everywhere else in Grove. The local JWT
-- verification in the app is an optimistic first line; this is what actually
-- keeps one person's intentions out of another person's reach.
drop policy if exists "move tends are private to their owner" on public.move_tends;
create policy "move tends are private to their owner"
  on public.move_tends
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
