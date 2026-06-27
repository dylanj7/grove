-- Phase 4.5 — Two check-ins a day. Run once in the Supabase SQL editor.
-- Additive and idempotent: safe to run on the live database as-is.
--
-- The day becomes symmetric: one morning check-in and one evening check-in,
-- each feeding its own brief slot. So a check-in is now keyed by
-- (user_id, day, slot) instead of (user_id, day).

-- 1. Slot. Existing rows are evening check-ins (that's all Grove had), so they
--    default to 'evening'.
alter table public.checkins
  add column if not exists slot text not null default 'evening';

-- 2. Drop the old one-row-per-day uniqueness, whatever it's named. Without this
--    a user couldn't hold both a morning and an evening row for the same day.
--    Name-agnostic: drops any UNIQUE constraint on exactly (user_id, day).
do $$
declare
  rec record;
begin
  for rec in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.checkins'::regclass
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname::text)
        from pg_attribute att
        where att.attrelid = con.conrelid
          and att.attnum = any(con.conkey)
      ) = array['day', 'user_id']
  loop
    execute format('alter table public.checkins drop constraint %I', rec.conname);
  end loop;
end $$;

-- Belt-and-suspenders for the rare case the uniqueness was a bare index
-- (default name) rather than a constraint.
drop index if exists public.checkins_user_id_day_key;

-- 3. The new upsert target: one row per (user, day, slot).
create unique index if not exists checkins_user_day_slot_key
  on public.checkins (user_id, day, slot);
