// lib/grove-tree.ts
// ----------------------------------------------------------------
// THE TREE, as a record rather than a gauge.
//
// The old tree took a single number — `fullness`, 0 to 1 — and grew to match
// it. That is a progress bar with leaves on it. Whatever fed that number would
// have become the thing to maximize, and the app would have spent its whole
// visual budget on a score while the copy carefully avoided saying one.
//
// SO THE RULE HERE: the tree encodes WHAT HAPPENED AND WHEN. It never encodes
// HOW WELL. Three consequences, and each one is load-bearing:
//
//   1. THE TRUNK IS TIME, NOT EFFORT. It grows with how long the record has
//      existed — nothing else. It grows on the weeks you never opened the app.
//      You cannot fall behind your own tree, and there is no state in which it
//      shrinks, wilts, or reproaches you. This is the single most important
//      property: it is what makes the tree safe to care about.
//
//   2. A LEAF IS A DAY YOU SET SOMETHING DOWN — and where it sits is HOW THAT
//      DAY FELT, not how good it was. A heavy day puts a leaf on the tree just
//      as surely as a bright one; it simply sits lower on its branch. So the
//      tree's silhouette is the shape of your history, and a hard month is
//      visible in it as texture rather than as absence. Nothing about a bad
//      stretch is punished by having less tree.
//
//   3. THERE IS NO TOTAL. No count is displayed, no percentage, no "fullness",
//      and — because the leaf positions carry felt state rather than merit —
//      there is no scalar you could extract to rank two trees, or to rank this
//      week against last. That is the difference between tracking and measuring,
//      and it is the reason this file computes a SHAPE and never a score.
//
// Pure and deterministic, like patterns.ts and rhythm.ts. It reads; it never
// interprets and it never judges.
// ----------------------------------------------------------------

/** One day that was set down: where it falls in time, and how it felt. */
export type Leaf = {
  day: string;
  /** Weeks since the first recorded day. 0 is the oldest week, at the base. */
  week: number;
  /** 0 (Mon) … 6 (Sun) — the leaf's place along its branch. */
  weekday: number;
  /** The day's mood, 1–5, or null if only body was recorded. Height, not merit. */
  mood: number | null;
};

export type GroveShape = {
  /** How many weeks the record spans. THE TRUNK. Time, and only time. */
  weeks: number;
  leaves: Leaf[];
  /** The first day ever recorded, for the honest "keeping this since" line. */
  firstDay: string | null;
};

export type TreeDay = { day: string; mood: number | null };

const DAY_MS = 86_400_000;

/** Epoch-day number for a YYYY-MM-DD, so week maths never touches local time. */
function epochDay(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
function weekdayIndex(day: string): number {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return (dow + 6) % 7;
}

/**
 * The most weeks the tree will draw. Beyond this the oldest weeks are dropped
 * from the DRAWING (not from the record) so a two-year grove stays a tree on a
 * phone screen instead of a thread. Deliberately not "the tree stops growing" —
 * it keeps its full height and shows the most recent stretch of it.
 */
export const MAX_WEEKS = 52;

export function buildGrove(days: TreeDay[], today: string): GroveShape {
  // One entry per calendar day: a day with both a morning and an evening
  // capture is still ONE day that was set down. Counting it twice would make
  // the tree quietly reward frequency, which is the thing it must not do.
  // Where a day has two moods, keep the one that is present.
  const byDay = new Map<string, number | null>();
  for (const d of days) {
    const existing = byDay.get(d.day);
    if (existing == null) byDay.set(d.day, d.mood);
  }

  const recorded = [...byDay.keys()].sort();
  if (recorded.length === 0) {
    return { weeks: 0, leaves: [], firstDay: null };
  }

  const firstDay = recorded[0];
  const firstEpoch = epochDay(firstDay);
  // The trunk measures elapsed time, so it is anchored to TODAY — not to the
  // last day anything was captured. A month away from the app is a month the
  // tree still grew.
  const totalWeeks = Math.floor((epochDay(today) - firstEpoch) / 7) + 1;

  // When the record outruns the drawing, slide the window forward and re-index
  // so week 0 is the oldest week still shown.
  const shownWeeks = Math.min(totalWeeks, MAX_WEEKS);
  const weekOffset = totalWeeks - shownWeeks;

  const leaves: Leaf[] = [];
  for (const day of recorded) {
    const week = Math.floor((epochDay(day) - firstEpoch) / 7) - weekOffset;
    if (week < 0) continue; // older than the drawn window
    leaves.push({ day, week, weekday: weekdayIndex(day), mood: byDay.get(day) ?? null });
  }

  return { weeks: shownWeeks, leaves, firstDay };
}

/** "since March 2026" — tenure stated as a date, never as a duration to grow. */
export function sinceLabel(firstDay: string): string {
  return new Date(`${firstDay}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
