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
