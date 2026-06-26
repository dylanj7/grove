// One date convention across Grove: the UTC calendar day (YYYY-MM-DD). Matches
// the brief route and the seed. Per-user timezone is a later phase.
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
