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

export type PhysicalDay = {
  day: string;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  steps: number | null;
  active_minutes: number | null;
  recovery_score: number | null;
};

export type Checkin = {
  day: string;
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

  // ===== MENTAL: scattered focus =====
  const focusRows = checkins.filter((c) => c.focus != null);
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
  const energyRows = checkins.filter((c) => c.energy != null);
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

  for (const g of goals.filter((x) => x.status === "active")) {
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

// ----------------------------------------------------------------
// A compact, factual snapshot of the window for the model — alongside
// the verified patterns. Numbers only; no interpretation here.
// ----------------------------------------------------------------
export function windowSummary(
  physical: PhysicalDay[],
  checkins: Checkin[],
  goals: Goal[],
): string {
  const lastSleep = physical[0]?.sleep_minutes;
  const lastReco = physical[0]?.recovery_score;
  const c = checkins[0];
  const active = goals.filter((g) => g.status === "active");
  return [
    `Latest sleep: ${lastSleep ? Math.round((lastSleep / 60) * 10) / 10 + "h" : "no data"}.`,
    `Latest recovery score: ${lastReco ?? "no data"}.`,
    c ? `Latest check-in — mood ${c.mood}/5, energy ${c.energy}/5, focus ${c.focus}/5.` : "No recent check-in.",
    `Active goals: ${active.map((g) => `${g.title} [${g.aspect}/${g.horizon}]`).join("; ") || "none yet"}.`,
  ].join("\n");
}
