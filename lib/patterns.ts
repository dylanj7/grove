// lib/patterns.ts
// ----------------------------------------------------------------
// THE HONESTY LAYER — part 1 of 2.
//
// Pure, deterministic code. No Claude here. It reads the 14-day
// window and finds CANDIDATE patterns — streaks, dips, cross-pillar
// co-occurrences — that each clear a threshold. Claude (part 2) is
// only ever allowed to choose among the patterns this file already
// verified true in the data. That separation is what makes Grove's
// brief trustworthy: the model cannot invent a connection.
//
// All input arrays arrive NEWEST-FIRST (day desc).
// ----------------------------------------------------------------

import { recoveryBand } from "./recovery";

export type PhysicalDay = {
  day: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null; // feeds recovery; carried here so the window summary can read it
  resting_hr: number | null;
  hrv_ms: number | null;
  steps: number | null;
  active_minutes: number | null;
  recovery_score: number | null;
};

export type Checkin = {
  day: string;
  slot: "morning" | "evening";
  mood: number | null;
  energy: number | null;
  focus: number | null;
  note_text: string | null;
};

export type GoalTouch = { goal_id: string; day: string };

export type Goal = {
  id: string;
  title: string;
  aspect: "physical" | "mental" | "work";
  horizon: "short" | "long";
  kind: "habit" | "goal";
  cadence: "daily" | "weekly" | null;
  progress: number | null;
  status: string;
};

export type Pattern = {
  code: string;                                   // machine id, for debugging which rule fired
  statement: string;                              // human-readable fact, already verified true
  pillars: ("physical" | "mental" | "work")[];    // which pillars it spans (keeps the brief balanced)
  strength: "weak" | "moderate" | "strong";       // lets Claude prioritize
};

// ---------- small helpers ----------
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const take = <T,>(rows: T[], n: number) => rows.slice(0, n); // newest-first, so slice from front

// consecutive days from today backward where pred holds
function streak<T>(rows: T[], pred: (r: T) => boolean): number {
  let n = 0;
  for (const r of rows) {
    if (pred(r)) n++;
    else break;
  }
  return n;
}

// There can now be two check-ins on one day (morning + evening). The day-trend
// detectors must reason in DAYS, not rows, or "low focus 3 days running" would
// silently mean three rows = a day and a half. Collapse to one row per day,
// keeping the day's latest (input is newest-first, so the first seen per day).
function latestPerDay(checkins: Checkin[]): Checkin[] {
  const seen = new Set<string>();
  const out: Checkin[] = [];
  for (const c of checkins) {
    if (seen.has(c.day)) continue;
    seen.add(c.day);
    out.push(c);
  }
  return out;
}

// ----------------------------------------------------------------
// The detector. Returns every verified pattern; Claude picks among them.
// ----------------------------------------------------------------
export function detectPatterns(
  physical: PhysicalDay[],
  checkins: Checkin[],
  touches: GoalTouch[],
  goals: Goal[],
): Pattern[] {
  const out: Pattern[] = [];

  // ===== PHYSICAL: sleep debt =====
  const sleeps = physical.filter((d) => d.sleep_minutes != null);
  if (sleeps.length >= 3) {
    const last3 = avg(take(sleeps, 3).map((d) => d.sleep_minutes!));
    const base = avg(sleeps.map((d) => d.sleep_minutes!));
    if (last3 < base - 30 && last3 < 420) {
      out.push({
        code: "sleep_dip",
        statement: `Sleep has run short the last 3 nights (avg ${Math.round(last3)} min vs your ${Math.round(base)} min baseline).`,
        pillars: ["physical"],
        strength: last3 < 360 ? "strong" : "moderate",
      });
    }
  }

  // ===== PHYSICAL: low recovery streak =====
  const recos = physical.filter((d) => d.recovery_score != null);
  if (recos.length >= 4) {
    const s = streak(recos, (d) => (d.recovery_score ?? 100) < 50);
    if (s >= 3) {
      out.push({
        code: "low_recovery_streak",
        statement: `Recovery has been low ${s} days running.`,
        pillars: ["physical"],
        strength: s >= 5 ? "strong" : "moderate",
      });
    }
  }

  // ===== PHYSICAL: HRV suppressed vs baseline =====
  const hrvs = physical.filter((d) => d.hrv_ms != null);
  if (hrvs.length >= 5) {
    const base = avg(hrvs.map((d) => d.hrv_ms!));
    const last3 = avg(take(hrvs, 3).map((d) => d.hrv_ms!));
    if (last3 < base * 0.85) {
      out.push({
        code: "hrv_suppressed",
        statement: `HRV is down about ${Math.round((1 - last3 / base) * 100)}% vs your two-week baseline.`,
        pillars: ["physical"],
        strength: last3 < base * 0.75 ? "strong" : "moderate",
      });
    }
  }

  // One representative check-in per day for the day-trend detectors.
  const dayCheckins = latestPerDay(checkins);

  // ===== MENTAL: scattered focus =====
  const focusRows = dayCheckins.filter((c) => c.focus != null);
  if (focusRows.length >= 3) {
    const s = streak(focusRows, (c) => (c.focus ?? 5) <= 2);
    if (s >= 2) {
      out.push({
        code: "focus_scattered",
        statement: `You've logged low focus ${s} days in a row.`,
        pillars: ["mental"],
        strength: s >= 3 ? "strong" : "moderate",
      });
    }
  }

  // ===== MENTAL: low energy =====
  const energyRows = dayCheckins.filter((c) => c.energy != null);
  if (energyRows.length >= 3) {
    const s = streak(energyRows, (c) => (c.energy ?? 5) <= 2);
    if (s >= 2) {
      out.push({
        code: "energy_low",
        statement: `Energy has been low ${s} days in a row.`,
        pillars: ["mental"],
        strength: s >= 3 ? "strong" : "moderate",
      });
    }
  }

  // ===== MENTAL: the most recent check-in, in words =====
  // A single check-in is real material for the brief — even with no Fitbit data
  // and no multi-day trend yet. Translate the stored 1–5 to a felt word so the
  // brief can speak to it honestly; the number is never surfaced.
  const latestCheckin = checkins.find(
    (c) => c.mood != null || c.energy != null || c.focus != null,
  );
  if (latestCheckin) {
    const MOOD = ["", "heavy", "low", "even", "light", "bright"];
    const ENERGY = ["", "drained", "low", "steady", "full", "brimming"];
    const FOCUS = ["", "scattered", "foggy", "okay", "clear", "sharp"];
    const parts: string[] = [];
    if (latestCheckin.mood != null) parts.push(`mood ${MOOD[latestCheckin.mood] ?? "even"}`);
    if (latestCheckin.energy != null) parts.push(`energy ${ENERGY[latestCheckin.energy] ?? "steady"}`);
    if (latestCheckin.focus != null) parts.push(`focus ${FOCUS[latestCheckin.focus] ?? "okay"}`);
    let statement = `Most recent check-in — ${parts.join(", ")}.`;
    const note = latestCheckin.note_text?.trim();
    if (note) statement += ` In their words: "${note.slice(0, 240)}".`;
    out.push({
      code: "checkin_state",
      statement,
      pillars: ["mental"],
      strength: "moderate",
    });
  }

  // ===== GOALS: neglected habits & stalled milestones =====
  const touchDays = new Map<string, Set<string>>();
  for (const t of touches) {
    if (!touchDays.has(t.goal_id)) touchDays.set(t.goal_id, new Set());
    touchDays.get(t.goal_id)!.add(t.day);
  }
  const windowDays = physical.map((d) => d.day); // newest-first calendar of the window

  // Sorted so the goal-derived patterns are pushed in a stable order — the
  // patterns array is fingerprinted into the brief signature, so its order must
  // not depend on however the rows happened to arrive.
  const activeGoals = goals
    .filter((x) => x.status === "active")
    .sort((a, b) => a.aspect.localeCompare(b.aspect) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  for (const g of activeGoals) {
    const days = touchDays.get(g.id) ?? new Set<string>();

    if (g.kind === "habit" && g.cadence === "daily") {
      let gap = 0;
      for (const d of windowDays) {
        if (days.has(d)) break;
        gap++;
      }
      if (gap >= 2) {
        out.push({
          code: "habit_neglected",
          statement: `"${g.title}" hasn't been tended in ${gap} days.`,
          pillars: [g.aspect],
          strength: gap >= 4 ? "strong" : "moderate",
        });
      }
    }

    if (g.kind === "goal" && g.horizon === "short" && days.size === 0) {
      out.push({
        code: "milestone_stalled",
        statement: `No progress logged on "${g.title}" in the last two weeks.`,
        pillars: [g.aspect],
        strength: "moderate",
      });
    }
  }

  // ===== CROSS-PILLAR — the product's whole reason to exist =====
  // Only assert a chain when each leg is INDEPENDENTLY true above.
  const has = (code: string) => out.some((p) => p.code === code);
  const underRecovered = has("sleep_dip") || has("low_recovery_streak") || has("hrv_suppressed");
  const cognitivelyOff = has("focus_scattered") || has("energy_low");
  const executionSlipping = has("habit_neglected") || has("milestone_stalled");

  if (underRecovered && cognitivelyOff && executionSlipping) {
    out.push({
      code: "recovery_to_execution_chain",
      statement:
        "Under-recovery, lower focus, and slipping goal execution are all showing up together this week — the order that fits the data is body → mind → output.",
      pillars: ["physical", "mental", "work"],
      strength: "strong",
    });
  } else if (underRecovered && cognitivelyOff) {
    out.push({
      code: "recovery_to_mind",
      statement: "The dip in recovery and the drop in focus/energy are tracking together this week.",
      pillars: ["physical", "mental"],
      strength: "moderate",
    });
  }

  return out;
}

// Whole days between two YYYY-MM-DD strings (pure: depends only on its args).
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ----------------------------------------------------------------
// A compact, factual snapshot of the window for the model — alongside the
// verified patterns. State (body + check-in) AND direction (goals/habits and
// how they've actually been tended), so the brief can be specific to THIS day
// instead of a generic mood reflection. Facts only; no interpretation here.
//
// Fully deterministic given its inputs — which is what lets the brief freeze:
// this string is part of the content signature (see app/api/brief/route.ts).
// `today` is the stable calendar identity of the brief, passed in (never read
// from the clock here) so the summary is reproducible.
// ----------------------------------------------------------------
export function windowSummary(
  physical: PhysicalDay[],
  checkins: Checkin[],
  goals: Goal[],
  touches: GoalTouch[],
  today: string,
): string {
  const p = physical[0];
  const c = checkins[0];

  // The latest body reading, present metrics only, as plain facts. Listing
  // every metric here is also what folds the reading into the brief's content
  // signature — edit any number and the brief regenerates once, then holds.
  const body: string[] = [];
  if (p?.sleep_minutes != null) body.push(`slept ${Math.round((p.sleep_minutes / 60) * 10) / 10}h`);
  if (p?.sleep_efficiency != null) body.push(`sleep efficiency ${Math.round(p.sleep_efficiency)}%`);
  if (p?.resting_hr != null) body.push(`resting HR ${Math.round(p.resting_hr)}`);
  if (p?.hrv_ms != null) body.push(`HRV ${Math.round(p.hrv_ms)}ms`);

  // Activity is honest context for the brief — never a goal, ring, or streak.
  // Present only when a band supplied it; raw figures (no locale formatting) so
  // the string stays a pure function of its inputs for the brief signature.
  const activity: string[] = [];
  if (p?.steps != null) activity.push(`${Math.round(p.steps)} steps`);
  if (p?.active_minutes != null) activity.push(`${Math.round(p.active_minutes)} active min`);

  // Tending history per goal/habit: most-recent touch day + how many distinct
  // days tended in the window. Computed as the MAX day (not the first row seen)
  // so the summary doesn't depend on the order touches arrive — it's part of the
  // brief signature, so it must be a pure function of WHICH touches exist.
  const lastTouch = new Map<string, string>();
  const touchedDays = new Map<string, Set<string>>();
  for (const t of touches) {
    const cur = lastTouch.get(t.goal_id);
    if (!cur || t.day > cur) lastTouch.set(t.goal_id, t.day); // YYYY-MM-DD sorts chronologically
    if (!touchedDays.has(t.goal_id)) touchedDays.set(t.goal_id, new Set());
    touchedDays.get(t.goal_id)!.add(t.day);
  }

  const active = goals
    .filter((g) => g.status === "active")
    .sort((a, b) => a.aspect.localeCompare(b.aspect) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  const direction = active.map((g) => {
    const kind = g.kind === "habit" ? "habit" : "goal";
    const last = lastTouch.get(g.id);
    const count = touchedDays.get(g.id)?.size ?? 0;
    let tend: string;
    if (!last) {
      tend = "never tended in the last 14 days";
    } else {
      const ago = daysBetween(last, today);
      const when = ago <= 0 ? "today" : ago === 1 ? "yesterday" : `${ago}d ago`;
      tend = `last tended ${when}, ${count} day${count === 1 ? "" : "s"} in the window`;
    }
    return `- "${g.title}" (${kind}, ${g.aspect}): ${tend}`;
  });

  return [
    body.length
      ? `Latest body reading — ${body.join(", ")}.`
      : "No physical reading yet — the body is unmeasured.",
    // Recovery is given as a sense, never a figure — it must not be echoed back
    // to the user as a score to beat.
    `Recovery reads: ${recoveryBand(p?.recovery_score ?? null)}.`,
    activity.length ? `Today's activity — ${activity.join(", ")}.` : null,
    c
      ? `Latest check-in (${c.slot}) — mood ${c.mood}/5, energy ${c.energy}/5, focus ${c.focus}/5.`
      : "No recent check-in.",
    direction.length
      ? `Goals and habits, with how they've been tended:\n${direction.join("\n")}`
      : "No goals or habits planted yet.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
