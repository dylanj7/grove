// lib/nudges.ts
// ----------------------------------------------------------------
// THE HONESTY LAYER — part 3.
//
// patterns.ts finds what is true. read.ts says it on the screen. This file
// decides the much narrower question of when a true thing is worth INTERRUPTING
// someone for — and it is the same kind of code: pure, deterministic, no model,
// no clock read, no database. Given a window it returns candidates; the sender
// (app/api/nudges/run) decides whether any of them clears the ceiling.
//
// WHY THERE IS NO 9AM PING. A scheduled daily notification is the single thing
// most reliably responsible for a journaling app being deleted: it arrives
// whether or not it has anything to say, so it trains you to dismiss it, and
// after two weeks of dismissing it you dismiss the app. Every notification Grove
// is capable of sending is downstream of a specific change in the data — which
// is also the only kind of notification this product is ALLOWED to send, since
// it may not assert anything separate code hasn't verified.
//
// THREE RULES THIS FILE ENFORCES, and they are the product, not politeness:
//
//   1. A nudge names a fact and offers a door. Never a verdict, never a target,
//      never "you haven't...". The rhythm one offers to LET GO, because that is
//      a real and equal outcome in Grove and no other app in the category will
//      say it.
//   2. No counts, no streaks, no comparison against the person's own past with
//      a valence attached. "Under your usual" is a reference point, the same one
//      the chart's dashed line draws. "Down 3 days in a row" would be a score.
//   3. At most ONE nudge exists at a time. This returns a ranked list and the
//      caller takes the head of it. Two notifications in one evening is a
//      storm, and a storm is indistinguishable from a scheduled ping.
// ----------------------------------------------------------------

import type { WindowData } from "./window";
import type { MoveTend } from "./intentions";

export type Nudge = {
  /** Stable id for the cooldown. Carries its subject for the per-goal ones. */
  code: string;
  /** The exact state that made it true — two identical signatures are one fact. */
  signature: string;
  /** Notification title. Short: iOS truncates hard on the lock screen. */
  title: string;
  body: string;
  /** Where tapping it lands. Always somewhere that can act on what it said. */
  url: string;
  /** Lower sorts first. Body signal beats direction beats observation. */
  rank: number;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** The last n calendar days ending at `today`, newest first. */
function lastDays(today: string, n: number): string[] {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) =>
    new Date(t - i * 86_400_000).toISOString().slice(0, 10),
  );
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Every nudge the data currently justifies, best first.
 *
 * `today` is passed in, never read from a clock, for the same reason
 * windowSummary takes it: this must be reproducible. A detector whose output
 * depends on when you ran it can't be tested and can't be reasoned about.
 */
export function detectNudges(args: {
  win: WindowData;
  /** Recent acts on letter intentions — a few days is all this reaches. */
  moveTends: MoveTend[];
  today: string;
}): Nudge[] {
  const { win, moveTends, today } = args;
  const out: Nudge[] = [];
  const calendar = lastDays(today, 14);

  // ===== BODY: HRV under the person's own usual ==============================
  // The spec's first trigger, and the one with real timing value: it is worth
  // knowing on the morning it is true, because it changes what you'd choose to
  // do with the day. Six readings minimum — this is a claim about a person's
  // normal range, and four points don't establish one.
  //
  // The baseline EXCLUDES the reading being judged. Comparing a number against
  // an average it is itself inside makes the comparison quietly smaller than it
  // sounds, and "under your usual" then means something slightly untrue.
  const hrvRows = win.physical.filter((d) => d.hrv_ms != null);
  const newestHrv = hrvRows[0];
  if (newestHrv && hrvRows.length >= 6) {
    const age = daysBetween(newestHrv.day, today);
    const base = avg(hrvRows.slice(1).map((d) => d.hrv_ms!));
    // Only when the reading is actually current. A four-day-old measurement is
    // not news, and pushing it would be the notification equivalent of Home
    // presenting stale numbers as last night's.
    if (age <= 1 && newestHrv.hrv_ms! < base * 0.88) {
      out.push({
        code: "hrv_low",
        signature: `hrv:${newestHrv.day}`,
        title: "Your body's asking for a lighter day",
        // No figure. The letter isn't allowed to treat a body number as a
        // target and neither is this; the fact is the direction, not the digit.
        body: "Last night's HRV came in under your usual. Want to set something down?",
        url: "/home?capture=1",
        rank: 1,
      });
    }
  }

  // ===== DIRECTION: a rhythm has gone quiet ==================================
  // Three days untended, and only for a rhythm that was actually going — a
  // habit planted last week and never once touched gets no ping, because that
  // isn't a change, it's a thing that never started, and pinging about it is
  // just nagging with extra steps.
  //
  // The calendar comes from `today`, not from the physical rows. Deriving the
  // day list from the data (as the equivalent detector in patterns.ts does)
  // means a user with no band has no calendar and every gap silently reads as
  // zero.
  const touchDays = new Map<string, Set<string>>();
  for (const t of win.touches) {
    if (!touchDays.has(t.goal_id)) touchDays.set(t.goal_id, new Set());
    touchDays.get(t.goal_id)!.add(t.day);
  }

  const dailyRhythms = win.goals
    .filter((g) => g.status === "active" && g.kind === "habit" && g.cadence === "daily")
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

  for (const g of dailyRhythms) {
    const days = touchDays.get(g.id) ?? new Set<string>();
    if (days.size === 0) continue; // never started — see above

    let gap = 0;
    for (const d of calendar) {
      if (days.has(d)) break;
      gap++;
    }
    if (gap < 3) continue;

    out.push({
      code: `rhythm_quiet:${g.id}`,
      // Bucketed by the gap, so a rhythm that stays quiet doesn't re-fire every
      // night — the cooldown catches most of it, this catches the rest.
      signature: `quiet:${g.id}:${gap >= 7 ? "7+" : gap}`,
      title: `"${g.title}" has gone quiet`,
      // The release is offered first-class. This is the sentence no other app in
      // the category will send you, and it is the whole voice in one line.
      body: "Three days untended. Keep it, or let it go?",
      url: "/home",
      rank: 2,
    });
  }

  // ===== THE NOTICING ========================================================
  // Two mornings in a row with energy full or brimming and nothing set down all
  // day. The spec's framing is exactly right — "the app noticed and says so" —
  // and the copy has to stop there. One clause further and it is telling
  // someone they wasted two good days, which is a grade.
  const morningEnergy = new Map<string, number>();
  for (const c of win.checkins) {
    if (c.slot !== "morning" || c.energy == null) continue;
    // Newest-first input; keep the first seen per day.
    if (!morningEnergy.has(c.day)) morningEnergy.set(c.day, c.energy);
  }

  const tendedDays = new Set<string>([
    ...win.touches.map((t) => t.day),
    ...moveTends.filter((t) => t.state === "tended").map((t) => t.day),
  ]);

  // Yesterday and the day before: today isn't over, and judging an unfinished
  // day is the same error as reading a 9am step count as a day's total.
  const [, yesterday, dayBefore] = calendar;
  const bright = (d: string) => (morningEnergy.get(d) ?? 0) >= 4;
  if (
    yesterday &&
    dayBefore &&
    bright(yesterday) &&
    bright(dayBefore) &&
    !tendedDays.has(yesterday) &&
    !tendedDays.has(dayBefore)
  ) {
    out.push({
      code: "energy_unspent",
      signature: `unspent:${dayBefore}:${yesterday}`,
      title: "Two full mornings, nothing set down",
      body: "Grove noticed, that's all. No verdict — there might not be one.",
      url: "/home",
      rank: 3,
    });
  }

  return out.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
}

// ----------------------------------------------------------------
// THE CEILING.
//
// Kept here rather than in the route so the promise and the detector live in
// one file — "Grove only pings you when something changes, and never more than
// three times a week" is one idea and it should be readable in one place.
// ----------------------------------------------------------------

/** Hard maximum, over a rolling 7 days. Not a preference. */
export const WEEKLY_CAP = 3;

/** Days a given code stays silent after firing, however true it stays. */
export const COOLDOWN_DAYS = 4;

/**
 * Minimum hours between ANY two nudges, whatever their codes.
 *
 * This is what makes the sender safe to run at any cadence. The cron schedule
 * is a deployment detail that will change — hourly on one plan, daily on
 * another — and the guarantee must not be a property of the crontab. Twenty
 * hours means "at most one a day" without being brittle about what time
 * yesterday's went out.
 */
export const MIN_GAP_HOURS = 20;

/**
 * The hours it is acceptable to make someone's phone buzz, local to the DEVICE.
 *
 * Inclusive start, exclusive end. Nothing Grove has to say is worth waking
 * someone for — and a wellness app that pings at 3am has said something about
 * itself that no amount of careful copy elsewhere will undo.
 */
export const CIVIL_HOURS = { from: 9, to: 21 } as const;

/**
 * Is it a civil hour on a device with this UTC offset?
 *
 * `tzOffset` is minutes as Date.getTimezoneOffset() reports it (local = UTC −
 * offset), matching the cookie the rest of the app uses. Unknown offset → false:
 * when Grove doesn't know what time it is where the phone is, it doesn't ring.
 */
export function isCivilHour(now: Date, tzOffset: number | null | undefined): boolean {
  if (tzOffset == null || !Number.isInteger(tzOffset) || Math.abs(tzOffset) > 840) return false;
  const localHour = new Date(now.getTime() - tzOffset * 60_000).getUTCHours();
  return localHour >= CIVIL_HOURS.from && localHour < CIVIL_HOURS.to;
}

/** The copy that states the promise. Used verbatim in Settings — see §3.4: */
export const NUDGE_PROMISE =
  "Grove only pings you when something in your data changes — never on a schedule, and never more than three times a week.";

/**
 * The first candidate that clears both gates, or null.
 *
 * `recent` is every send inside the cooldown horizon, newest first. Pure: the
 * caller does the reading and the writing, this does the deciding.
 */
export function pickNudge(args: {
  candidates: Nudge[];
  recent: { code: string; signature: string; sent_at: string }[];
  now: Date;
  weeklyCap?: number;
  cooldownDays?: number;
}): Nudge | null {
  const { candidates, recent, now } = args;
  const cap = args.weeklyCap ?? WEEKLY_CAP;
  const cooldown = (args.cooldownDays ?? COOLDOWN_DAYS) * 86_400_000;

  const weekAgo = now.getTime() - 7 * 86_400_000;
  const sentThisWeek = recent.filter((r) => Date.parse(r.sent_at) > weekAgo).length;
  if (sentThisWeek >= cap) return null;

  // At most one a day, regardless of code — so the sender's behavior does not
  // depend on how often the cron happens to be scheduled. See MIN_GAP_HOURS.
  const gapFloor = now.getTime() - MIN_GAP_HOURS * 3_600_000;
  if (recent.some((r) => Date.parse(r.sent_at) > gapFloor)) return null;

  return (
    candidates.find((n) => {
      const last = recent.find((r) => r.code === n.code);
      if (!last) return true;
      // The same fact restated is never sent twice, ever — the signature is what
      // makes "something changed" mean something.
      if (last.signature === n.signature) return false;
      return now.getTime() - Date.parse(last.sent_at) > cooldown;
    }) ?? null
  );
}
