// lib/rhythm.ts
// ----------------------------------------------------------------
// The window, reshaped for the eye.
//
// Grove holds fourteen days of body and mind data. This turns that window into
// aligned daily series so the screen can show it — and, because every facet
// shares one time axis, so the coupling between last night's sleep and today's
// focus is something you SEE rather than something the app has to tell you.
//
// Pure and deterministic, like patterns.ts. It reads; it never interprets.
//
// Gaps stay gaps. A day with no check-in is `null`, not a zero and not an
// interpolation — which is why nothing here is ever drawn as a line. A line
// through a missing Tuesday would invent a value the user never gave.
//
// ---------------------------------------------------------------------------
// TWO KINDS OF SERIES, and the distinction is the whole point of this rewrite.
//
// The first version drew every facet as a bar from zero, which is correct for
// sleep and WRONG for the dials, in a way that made the chart quietly dishonest:
//
//   • Sleep is a MAGNITUDE. Zero hours is a real, meaningful zero; twice the bar
//     is twice the sleep. A bar from the baseline is exactly right.
//
//   • Mood, energy and focus are ORDINAL POSITIONS on a five-step scale of
//     words. "heavy" is not "one fifth of a mood" and "bright" is not five times
//     it — they are places on a scale, and the distance between them is not a
//     quantity at all. Drawing them as bars from zero asserted a ratio that does
//     not exist, made the worst possible day still render as a visible column of
//     something, and made an empty day and a "heavy" day look like neighbours on
//     the same continuum. So the dials are now drawn as a MARK ON A TRACK: the
//     position carries the meaning, and no area is claimed.
//
// This is also what fixes the "the graphs don't make sense" reading of a sparse
// window. Three readings out of fourteen drawn as three lonely bars looks like a
// broken chart; three marks on a visible fourteen-day track looks like exactly
// what it is — a fortnight, mostly unrecorded, with three days set down.
// ---------------------------------------------------------------------------

import type { WindowData } from "./window";
import { minutesToHours } from "./physical";

export type Point = { day: string; value: number | null };

/** How a facet's values relate to each other — and therefore how to draw it. */
export type SeriesKind = "magnitude" | "ordinal";

export type Latest = {
  day: string;
  value: number;
  /** 0 = today, 1 = yesterday, … Drives the recency phrase on the label. */
  daysAgo: number;
};

export type Series = {
  key: string;
  /** The row label, e.g. "Sleep". */
  label: string;
  /** Which pillar it belongs to — decides which of the two data hues it wears. */
  pillar: "body" | "mind";
  kind: SeriesKind;
  points: Point[];
  /** Top of this facet's scale. Sleep is data-driven; the dials are fixed 1–5. */
  max: number;
  /**
   * MAGNITUDE ONLY — the person's own average across the window, drawn as a
   * quiet reference so a night reads as longer or shorter than usual instead of
   * as an anonymous column. Without it every night between 6h and 8h renders as
   * a nearly identical near-full bar and a genuine 90-minute swing is invisible.
   *
   * It is a REFERENCE, never a target: no valence, no colour, no arrow, nothing
   * to beat. Grove doesn't grade you against your own past — but it is allowed
   * to show you where your middle is, which is the difference between a
   * comparison and a scale.
   */
  baseline: number | null;
  /** How the newest real value is written out, e.g. "7h 20m". */
  format: (v: number) => string;
  /** The words at the low and high ends — Grove speaks in senses, not scores. */
  ends: [string, string];
  /** The newest real reading AND how long ago it was. Never just the value. */
  latest: Latest | null;
  /** How many days in the window carry a reading, for the honest coverage note. */
  recorded: number;
};

export type RhythmData = {
  /** Newest LAST, so the chart reads left-to-right like a calendar. */
  days: string[];
  series: Series[];
  /** True when there is at least one real value anywhere. */
  hasAny: boolean;
};

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The last N calendar days ending today, oldest first. */
function lastNDays(n: number, today: string): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(dayKey(new Date(end - i * 86_400_000)));
  }
  return out;
}

function hoursLabel(v: number): string {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

const MOOD = ["", "heavy", "low", "even", "light", "bright"];
const ENERGY = ["", "drained", "low", "steady", "full", "brimming"];
const FOCUS = ["", "scattered", "foggy", "okay", "clear", "sharp"];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * The newest real point, WITH its age.
 *
 * The old version of this returned a bare value, and the chart printed it as
 * the facet's headline — so a mood set down ten days ago was displayed, in the
 * present tense, next to today's label. On a sparse window the screen was
 * confidently telling you how you feel right now based on a reading from last
 * week. That is precisely the class of untrue-but-plausible statement the rest
 * of the app is built to make impossible, and it was sitting in the chart.
 */
function latestOf(points: Point[], days: string[]): Latest | null {
  const todayKey = days[days.length - 1];
  const end = Date.parse(`${todayKey}T00:00:00Z`);
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.value == null) continue;
    const daysAgo = Math.round((end - Date.parse(`${p.day}T00:00:00Z`)) / 86_400_000);
    return { day: p.day, value: p.value, daysAgo };
  }
  return null;
}

export function buildRhythm(
  win: WindowData,
  today: string,
  windowDays = 14,
): RhythmData {
  const days = lastNDays(windowDays, today);

  const sleepByDay = new Map<string, number>();
  for (const p of win.physical) {
    const h = minutesToHours(p.sleep_minutes);
    if (h != null) sleepByDay.set(p.day, h);
  }

  // One check-in per day for the dials: a day can hold both a morning and an
  // evening, and the evening is the fuller account of the day it belongs to.
  // win.checkins arrives newest-first with evening before morning within a day,
  // so the first sighting per day is the one to keep.
  const checkinByDay = new Map<string, (typeof win.checkins)[number]>();
  for (const c of win.checkins) {
    if (!checkinByDay.has(c.day)) checkinByDay.set(c.day, c);
  }

  const finish = (
    s: Omit<Series, "latest" | "recorded">,
  ): Series => ({
    ...s,
    latest: latestOf(s.points, days),
    recorded: s.points.filter((p) => p.value != null).length,
  });

  const dialSeries = (
    key: "mood" | "energy" | "focus",
    label: string,
    words: string[],
  ): Series =>
    finish({
      key,
      label,
      pillar: "mind",
      kind: "ordinal",
      points: days.map((d) => ({ day: d, value: checkinByDay.get(d)?.[key] ?? null })),
      max: 5,
      baseline: null, // an average of ordinal positions is not a real quantity
      format: (v) => words[Math.round(v)] ?? "—",
      ends: [words[1], words[5]],
    });

  const sleepValues = days
    .map((d) => sleepByDay.get(d))
    .filter((v): v is number => v != null);
  // Scale headroom so a good night doesn't touch the ceiling, floored at 8h so
  // short-sleep weeks still read as short rather than being rescaled to "full".
  const sleepMax = Math.max(8, Math.ceil(Math.max(0, ...sleepValues) + 0.5));

  const series: Series[] = [
    finish({
      key: "sleep",
      label: "Sleep",
      pillar: "body",
      kind: "magnitude",
      points: days.map((d) => ({ day: d, value: sleepByDay.get(d) ?? null })),
      max: sleepMax,
      // Needs a few nights before a "usual" means anything; below that the
      // reference line would just be a restatement of the one or two bars.
      baseline: sleepValues.length >= 4 ? mean(sleepValues) : null,
      format: hoursLabel,
      ends: ["short", "full"],
    }),
    dialSeries("mood", "Mood", MOOD),
    dialSeries("energy", "Energy", ENERGY),
    dialSeries("focus", "Focus", FOCUS),
  ];

  const hasAny = series.some((s) => s.recorded > 0);
  return { days, series, hasAny };
}

/** "today" / "yesterday" / "6 days ago" — the honest tense for a direct label. */
export function agoLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return `${daysAgo} days ago`;
}
