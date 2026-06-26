// Which brief belongs to "now". A single cutoff governs the morning/evening
// split; it reads the user's *local* time, so this is used client-side.

export const EVENING_CUTOFF_HOUR = 17; // 5pm local

export function currentSlot(now: Date = new Date()): "morning" | "evening" {
  return now.getHours() < EVENING_CUTOFF_HOUR ? "morning" : "evening";
}
