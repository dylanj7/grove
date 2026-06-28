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

// A raw physical_days row carries its provenance; the merged PhysicalDay does
// not — everything above the merge is source-blind by design.
type PhysicalRow = PhysicalDay & { source: string };

// Collapse a day's manual + band rows into one reading. Provider wins per metric
// (a `??` only falls through on null/undefined, so a real 0 from the band still
// counts); a manual metric the band lacks is kept. recovery_score is taken from
// whichever row stored one (the band leaves it null), else recomputed below.
function mergePhysical(rows: PhysicalRow[]): PhysicalDay[] {
  const byDay = new Map<string, { manual?: PhysicalRow; provider?: PhysicalRow }>();
  for (const r of rows) {
    const bucket = byDay.get(r.day) ?? {};
    if (r.source === "manual") bucket.manual = r;
    else bucket.provider = r; // google_health (or a legacy 'fitbit' row)
    byDay.set(r.day, bucket);
  }

  const merged: PhysicalDay[] = [];
  for (const { manual, provider } of byDay.values()) {
    const pref = <K extends keyof PhysicalDay>(k: K): PhysicalDay[K] =>
      (provider?.[k] ?? manual?.[k] ?? null) as PhysicalDay[K];
    merged.push({
      day: (provider ?? manual)!.day,
      sleep_minutes: pref("sleep_minutes"),
      sleep_efficiency: pref("sleep_efficiency"),
      resting_hr: pref("resting_hr"),
      hrv_ms: pref("hrv_ms"),
      steps: pref("steps"),
      active_minutes: pref("active_minutes"),
      recovery_score: provider?.recovery_score ?? manual?.recovery_score ?? null,
    });
  }
  // Newest-first — the contract every downstream reader (patterns) depends on.
  merged.sort((a, b) => (a.day < b.day ? 1 : -1));
  return merged;
}

export async function loadWindow(
  supabase: SupabaseClient,
  userId: string,
  days = 14,
): Promise<WindowData> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceDay = since.toISOString().slice(0, 10); // YYYY-MM-DD

  // Every query is TOTALLY ordered. Without this, Postgres returns rows in
  // arbitrary heap order that can flip between requests — and since the brief's
  // content signature is a fingerprint of these rows, an order flip changes the
  // signature and regenerates a brief that didn't actually change. Deterministic
  // order is what lets the brief freeze. (See app/api/brief/route.ts.)
  const [physicalRes, checkinsRes, goalsRes, touchesRes] = await Promise.all([
    supabase
      .from("physical_days")
      .select("day, source, sleep_minutes, sleep_efficiency, resting_hr, hrv_ms, steps, active_minutes, recovery_score")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      // source asc as a tiebreaker so a day's two rows arrive in a stable order
      // before they're merged — same determinism the brief signature relies on.
      .order("day", { ascending: false })
      .order("source", { ascending: true }),
    supabase
      .from("checkins")
      .select("day, slot, mood, energy, focus, note_text")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      // day desc, then slot asc so within a day 'evening' precedes 'morning'
      // — newest-first, and stable.
      .order("day", { ascending: false })
      .order("slot", { ascending: true }),
    supabase
      .from("goals")
      .select("id, title, aspect, horizon, kind, cadence, progress, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("aspect", { ascending: true })
      .order("title", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("goal_touches")
      .select("goal_id, day")
      .eq("user_id", userId)
      .gte("day", sinceDay)
      .order("day", { ascending: false })
      .order("goal_id", { ascending: true }),
  ]);

  for (const res of [physicalRes, checkinsRes, goalsRes, touchesRes]) {
    if (res.error) throw new Error(`loadWindow query failed: ${res.error.message}`);
  }

  // A day can now have TWO physical rows — manual and the band (google_health).
  // Merge them with provider-over-manual precedence PER METRIC: the band
  // supersedes a number it measured, while a manual metric the band didn't cover
  // survives. Neither is double-counted; nothing is silently discarded (§5).
  const physical = mergePhysical((physicalRes.data ?? []) as PhysicalRow[]);
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
