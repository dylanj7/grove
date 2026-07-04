// The brief route and seed key by the UTC calendar day (YYYY-MM-DD).
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// The user's *local* calendar day. What the user writes by hand (check-ins,
// goal touches) is keyed to the day they actually lived, so this is computed
// client-side and passed to the server, never derived from the server clock.
export function localDayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Guard for a client-supplied day before it reaches a write.
export function isValidDay(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// The user's *local* civil day, derived on the SERVER from their timezone offset
// (minutes, exactly as Date.getTimezoneOffset() reports it: local = UTC − offset).
// A Server Component reads the offset from a client-set cookie and computes the
// same day the browser would — with no round-trip. Given the client's own
// offset, this returns byte-for-byte what localDayISO() returns there.
export function localDayFromOffset(offsetMin: number): string {
  // Shift UTC by the offset so the Date's UTC fields spell the local wall clock.
  const shifted = new Date(Date.now() - offsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The user's local weekday name ("Monday"), on the same offset basis as
// localDayFromOffset — for the /today eyebrow, server-rendered without a round
// trip. Kept here (not in the component) so the impure clock read stays out of
// render, where React's purity rules forbid it.
export function localWeekdayLong(offsetMin: number): string {
  const shifted = new Date(Date.now() - offsetMin * 60_000);
  return shifted.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

// Parse a tz-offset cookie value into a sane integer offset, or null if absent /
// malformed. Range guards mirror the brief route (±840 min = ±14h covers every
// real zone). A null result means "we don't yet know the user's local time" —
// the caller must render a skeleton, never guess with server time.
export function parseTzOffset(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && Math.abs(n) <= 840 ? n : null;
}
