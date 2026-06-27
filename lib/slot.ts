// Which brief belongs to "now". A single cutoff governs the morning/evening
// split; it reads the user's *local* time, so this is used client-side.

export type Slot = "morning" | "evening";

export const EVENING_CUTOFF_HOUR = 17; // 5pm local

export function currentSlot(now: Date = new Date()): Slot {
  return now.getHours() < EVENING_CUTOFF_HOUR ? "morning" : "evening";
}

export function isSlot(s: string): s is Slot {
  return s === "morning" || s === "evening";
}
