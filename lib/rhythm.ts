// lib/rhythm.ts
// ----------------------------------------------------------------
// The window, reshaped for the eye.
//
// Grove has always held fourteen days of body and mind data and shown the user
// NONE of it. The only way to see your own life was to read a paragraph about
// it. This turns that same window into aligned daily series so the screen can
// show it — and, because every facet shares one time axis, so the coupling
// between last night's sleep and today's focus is something you SEE rather
// than something the app has to tell you.
//
// Pure and deterministic, like patterns.ts. It reads; it never interprets.
//
// Gaps stay gaps. A day with no check-in is `null`, not a zero and not an
// interpolation — which is why the screen draws bars rather than a line. A line
// through a missing Tuesday would invent a value the user never gave.
// ----------------------------------------------------------------

import type { WindowData } from "./window";
import { minutesToHours } from "./physical";

export type Point = { day: string; value: number | null };

export type Series = {
  key: string;
  /** The row label, e.g. "Sleep". */
  label: string;
  /** Which pillar it belongs to — decides which of the two data hues it wears. */
  pillar: "body" | "mind";
  points: Point[];
  /** Top of this facet's scale. Sleep is data-driven; the dials are fixed 1–5. */
  max: number;
  /** How the newest real value is written out, e.g. "7h 20m". */
  format: (v: number) => string;
  /** The words at the low and high ends — Grove speaks in senses, not scores. */
  ends: [string, string];
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

  const dialSeries = (
    key: "mood" | "energy" | "focus",
    label: string,
    words: string[],
  ): Series => ({
    key,
    label,
    pillar: "mind",
    points: days.map((d) => ({ day: d, value: checkinByDay.get(d)?.[key] ?? null })),
    max: 5,
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
    {
      key: "sleep",
      label: "Sleep",
      pillar: "body",
      points: days.map((d) => ({ day: d, value: sleepByDay.get(d) ?? null })),
      max: sleepMax,
      format: hoursLabel,
      ends: ["short", "full"],
    },
    dialSeries("mood", "Mood", MOOD),
    dialSeries("energy", "Energy", ENERGY),
    dialSeries("focus", "Focus", FOCUS),
  ];

  const hasAny = series.some((s) => s.points.some((p) => p.value != null));
  return { days, series, hasAny };
}

/** The newest real point in a series, for the one direct label it carries. */
export function latestPoint(s: Series): Point | null {
  for (let i = s.points.length - 1; i >= 0; i--) {
    if (s.points[i].value != null) return s.points[i];
  }
  return null;
}
