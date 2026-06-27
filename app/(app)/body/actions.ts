"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";
import { hasAnyMetric, type PhysicalMetrics } from "@/lib/physical";

export type SaveResult = { ok: true } | { ok: false; error: string };

// Read today's reading (by the user's local day) so the screen knows whether to
// invite a first entry or show what's already recorded.
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

// The manual write path. Upserts on (user_id, day) so re-entering today's
// numbers edits rather than duplicates — the same pattern as the check-in. The
// day is the user's local date. Source is recorded as 'manual'; recovery_score
// is cleared so the next brief read recomputes it from these inputs against the
// current window baseline (never a stale stored figure).
export async function saveReading(
  day: string,
  input: PhysicalMetrics,
): Promise<SaveResult> {
  if (!isValidDay(day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }
  if (!hasAnyMetric(input)) {
    return { ok: false, error: "Enter at least one number — whatever you have." };
  }

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
      error: "Couldn't set this down just now. Your numbers are safe — try again.",
    };
  }

  // The next brief read detects the changed reading via its input signature and
  // regenerates lazily — no eager invalidation here.
  return { ok: true };
}
