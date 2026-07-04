// Which brief belongs to "now". A single cutoff governs the morning/evening
// split; it reads the user's *local* time, so this is used client-side.

export type Slot = "morning" | "evening";

export const EVENING_CUTOFF_HOUR = 17; // 5pm local

export function currentSlot(now: Date = new Date()): Slot {
  return now.getHours() < EVENING_CUTOFF_HOUR ? "morning" : "evening";
}

// The server-side twin of currentSlot: the user's slot from their timezone
// offset (minutes, as Date.getTimezoneOffset() reports it) rather than the
// server's wall clock. This is what lets /today render the CORRECT slot on
// first paint from a cookie — never the Vercel region's local time, which would
// hand a user in another zone the wrong brief at a slot boundary.
export function currentSlotFromOffset(offsetMin: number): Slot {
  // Shift UTC by the offset so the Date's UTC hour is the user's local hour.
  const shifted = new Date(Date.now() - offsetMin * 60_000);
  return shifted.getUTCHours() < EVENING_CUTOFF_HOUR ? "morning" : "evening";
}

export function isSlot(s: string): s is Slot {
  return s === "morning" || s === "evening";
}
