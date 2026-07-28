-- scripts/phase6.sql
-- ---------------------------------------------------------------------------
-- PHASE 6 — Ask Grove.
--
-- One table. It stores the questions a person has asked about their own record
-- and the answer Grove gave, which does three jobs at once:
--
--   1. HISTORY. A question you asked a fortnight ago, and what the data said
--      then, is worth as much as the answer was — arguably more, because you
--      can now see whether it held. Throwing it away would make Ask a toy.
--   2. THE SPEND CEILING. The daily cap is a COUNT over this table, so the
--      limit is enforced against durable state rather than an in-memory counter
--      that every serverless cold start would reset to zero.
--   3. AUDIT. Every answer is generated under the constraint that it may only
--      restate verified patterns. Keeping the answers means that promise is
--      inspectable after the fact instead of merely asserted.
--
-- Run this ONCE before the new code touches the database, exactly as with
-- scripts/phase5.sql. It is idempotent — safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- The user's LOCAL day. The cap is "per day as the person experiences it",
  -- not per UTC day, or a cap would reset mid-evening for half the world.
  day         date not null,
  question    text not null,
  answer      text,
  created_at  timestamptz not null default now()
);

-- The cap query is (user_id, day) and the history query is (user_id, newest
-- first); one composite index serves both.
create index if not exists questions_user_day_idx
  on public.questions (user_id, day desc, created_at desc);

alter table public.questions enable row level security;

-- RLS is the real boundary here, same as everywhere else in Grove: the JWT
-- check in the app is an optimistic first line, and this is what actually keeps
-- one person's questions out of another person's reach.
drop policy if exists "questions are private to their owner" on public.questions;
create policy "questions are private to their owner"
  on public.questions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
