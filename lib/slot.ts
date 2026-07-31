// Which brief belongs to "now". A single cutoff governs the morning/evening
// split; it reads the user's *local* time, so this is used client-side.

export type Slot = "morning" | "evening";

export const EVENING_CUTOFF_HOUR = 17; // 5pm local, for a day that starts at 6

/**
 * How long "the morning" runs after a day begins.
 *
 * The default cutoff used to be a bare 5pm for everyone, which is right for a
 * six-o'clock riser and wrong for both ends of the distribution: someone up at
 * 4:30 has been going for twelve hours by then, and someone whose day starts at
 * ten gets an evening letter over lunch.
 *
 * Onboarding asks when the day actually starts and this is what the answer
 * moves. That mattering is the point — a setup question whose answer changes
 * nothing is a fake question, and this app can't afford one of those on the
 * screen where it first explains itself.
 */
export const MORNING_SPAN_HOURS = 11;

/** The local hour the evening letter takes over, given when the day starts. */
export function eveningCutoff(dayStartsHour: number | null | undefined): number {
  if (dayStartsHour == null || !Number.isInteger(dayStartsHour)) return EVENING_CUTOFF_HOUR;
  const start = Math.min(Math.max(dayStartsHour, 3), 12);
  return start + MORNING_SPAN_HOURS;
}

export function currentSlot(now: Date = new Date(), cutoff = EVENING_CUTOFF_HOUR): Slot {
  return now.getHours() < cutoff ? "morning" : "evening";
}

// The server-side twin of currentSlot: the user's slot from their timezone
// offset (minutes, as Date.getTimezoneOffset() reports it) rather than the
// server's wall clock. This is what lets /today render the CORRECT slot on
// first paint from a cookie — never the Vercel region's local time, which would
// hand a user in another zone the wrong brief at a slot boundary.
export function currentSlotFromOffset(
  offsetMin: number,
  cutoff = EVENING_CUTOFF_HOUR,
): Slot {
  // Shift UTC by the offset so the Date's UTC hour is the user's local hour.
  const shifted = new Date(Date.now() - offsetMin * 60_000);
  return shifted.getUTCHours() < cutoff ? "morning" : "evening";
}

/**
 * The day-start hour as carried on the client, alongside the tz offset.
 *
 * A cookie for the same reason `tzoff` is one: the slot has to be decided
 * server-side on first paint, and the alternative is a profile read on the
 * critical path of every screen to answer a question whose answer changes about
 * once. Absent or malformed → the default cutoff, which is the pre-Phase-8
 * behavior exactly.
 */
export const DAY_START_COOKIE = "daystart";

export function parseDayStart(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 3 && n <= 12 ? n : null;
}

export function isSlot(s: string): s is Slot {
  return s === "morning" || s === "evening";
}
