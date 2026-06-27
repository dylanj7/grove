// lib/window.ts
// ----------------------------------------------------------------
// Server-only window reader. Pulls the rolling N-day window from
// Supabase and shapes it into the arrays patterns.ts expects, NEWEST
// -FIRST. Also backfills recovery_score where it's missing but the
// inputs exist, so the brief works whether or not recovery is stored.
// ----------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhysicalDay, Checkin, GoalTouch, Goal } from "./patterns";
import { computeRecovery, type RecoveryBaseline } from "./recovery";

export type WindowData = {
  physical: PhysicalDay[];
  checkins: Checkin[];
  touches: GoalTouch[];
  goals: Goal[];
};

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export async function loadWindow(
  supabase: SupabaseClient,
  userId: string,
  days = 14,
): Promise<WindowData> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceDay = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const [physicalRes, checkinsRes, goalsRes, touchesRes] = await Promise.all([
    supabase
      .from("physical_days")
      .select("day, sleep_minutes, sleep_efficiency, resting_hr, hrv_ms, steps, active_minutes, recovery_score")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      .order("day", { ascending: false }),
    supabase
      .from("checkins")
      .select("day, mood, energy, focus, note_text")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      .order("day", { ascending: false }),
    supabase
      .from("goals")
      .select("id, title, aspect, horizon, kind, cadence, progress, status")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("goal_touches")
      .select("goal_id, day")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      .order("day", { ascending: false }),
  ]);

  for (const res of [physicalRes, checkinsRes, goalsRes, touchesRes]) {
    if (res.error) throw new Error(`loadWindow query failed: ${res.error.message}`);
  }

  const physical = (physicalRes.data ?? []) as PhysicalDay[];
  const checkins = (checkinsRes.data ?? []) as Checkin[];
  const goals = (goalsRes.data ?? []) as Goal[];
  const touches = (touchesRes.data ?? []) as GoalTouch[];

  // Backfill recovery_score where null but inputs exist, using the window's
  // own averages as the personal baseline.
  const baseline: RecoveryBaseline = {
    sleepMinutes: mean(physical.flatMap((d) => (d.sleep_minutes != null ? [d.sleep_minutes] : []))),
    restingHr: mean(physical.flatMap((d) => (d.resting_hr != null ? [d.resting_hr] : []))),
    hrvMs: mean(physical.flatMap((d) => (d.hrv_ms != null ? [d.hrv_ms] : []))),
  };

  for (const d of physical) {
    if (d.recovery_score == null) {
      const score = computeRecovery(
        {
          sleep_minutes: d.sleep_minutes,
          sleep_efficiency: d.sleep_efficiency,
          resting_hr: d.resting_hr,
          hrv_ms: d.hrv_ms,
        },
        baseline,
      );
      if (score != null) d.recovery_score = score;
    }
  }

  return { physical, checkins, touches, goals };
}
