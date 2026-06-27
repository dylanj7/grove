"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";
import { isSlot, type Slot } from "@/lib/slot";
import { hasAnyMetric, type PhysicalMetrics } from "@/lib/physical";

export type CheckinValues = {
  mood: number;
  energy: number;
  focus: number;
  note_text: string | null;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

// Read a slot's check-in for the user's local day, so the screen knows whether
// to invite the check-in or show it as already tended.
export async function getCheckin(
  day: string,
  slot: Slot,
): Promise<CheckinValues | null> {
  if (!isValidDay(day) || !isSlot(slot)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("checkins")
    .select("mood, energy, focus, note_text")
    .eq("user_id", user.id)
    .eq("day", day)
    .eq("slot", slot)
    .maybeSingle();

  return data ?? null;
}

// The single check-in write path. Upserts on (user_id, day, slot) so a user
// holds one morning and one evening check-in per day, and re-entering the same
// slot edits rather than duplicates.
export async function saveCheckin(
  day: string,
  slot: Slot,
  input: CheckinValues,
): Promise<SaveResult> {
  if (!isValidDay(day) || !isSlot(slot)) {
    return { ok: false, error: "Something's off with today. Try again." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You've been signed out. Sign in and try again." };
  }

  const { error } = await supabase.from("checkins").upsert(
    {
      user_id: user.id,
      day,
      slot,
      mood: input.mood,
      energy: input.energy,
      focus: input.focus,
      note_text: input.note_text,
    },
    { onConflict: "user_id,day,slot" },
  );

  if (error) {
    return {
      ok: false,
      error: "Couldn't set this down just now. Your words are safe — try again.",
    };
  }

  // The next brief read detects the change via its input signature and
  // regenerates lazily — no eager invalidation here.
  return { ok: true };
}

// ---- The body, now entered as part of the morning check-in (Phase 4.5 §1a) ----
// The physical reading still lives in physical_days and still feeds recovery and
// the brief exactly as the old /body screen fed it; only the input surface moved.

export async function getReading(day: string): Promise<PhysicalMetrics | null> {
  if (!isValidDay(day)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("physical_days")
    .select("sleep_minutes, sleep_efficiency, resting_hr, hrv_ms")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  return data ?? null;
}

// Upserts on (user_id, day) with source 'manual'; recovery_score is cleared so
// the next brief read recomputes it from these inputs. An all-empty reading is a
// no-op success — the morning check-in can be saved with no body numbers.
export async function saveReading(
  day: string,
  input: PhysicalMetrics,
): Promise<SaveResult> {
  if (!isValidDay(day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }
  if (!hasAnyMetric(input)) return { ok: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You've been signed out. Sign in and try again." };
  }

  const { error } = await supabase.from("physical_days").upsert(
    {
      user_id: user.id,
      day,
      sleep_minutes: input.sleep_minutes,
      sleep_efficiency: input.sleep_efficiency,
      resting_hr: input.resting_hr,
      hrv_ms: input.hrv_ms,
      source: "manual",
      recovery_score: null,
    },
    { onConflict: "user_id,day" },
  );

  if (error) {
    return {
      ok: false,
      error: "Couldn't set the body down just now. Your numbers are safe — try again.",
    };
  }

  return { ok: true };
}
