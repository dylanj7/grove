// lib/tree-state.ts
// ----------------------------------------------------------------
// THE LIVING TREE. Pure, deterministic, documented — the same discipline
// as recovery.ts.
//
// Until now the tree's fullness was a constant per daily tier: sapling
// before the check-in, fuller once tended, fullest with a brief — an arc
// that reset at midnight and told you nothing true beyond today. Now the
// canopy is a slow read of the last fourteen days of actual tending,
// with today's small arc layered on top. Show up for a fortnight and the
// grove stands genuinely full; drift for a week and it honestly thins.
//
// The line this must never cross: the tree is OBSERVED STATE, not a score.
//   - It is never numbered, labeled with progress, or explained in figures.
//   - It moves by DAYS, not by taps — no action gives an instant reward
//     spike beyond the same quiet daily arc that always existed.
//   - It cannot die, and a missed stretch can never punish below the
//     floor: an untended grove is a THINNER grove, still alive, still
//     breathing. Thin is an invitation, not a verdict.
// ----------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Where today stands — the same three tiers the grove page always had. */
export type DayTier = "quiet" | "tended" | "brief";

// The floor: a grove with no history is a young sapling, never a bare stick.
const FLOOR = 0.18;
// How much a fully tended fortnight adds — the slow, earned mass of the canopy.
const WINDOW_WEIGHT = 0.56;
// Today's arc, layered on the slow base. Small on purpose: the day still
// breathes, but the base is what the tree is ABOUT now.
const TIER_BOOST: Record<DayTier, number> = { quiet: 0, tended: 0.1, brief: 0.18 };

/**
 * Fullness in [0.18, 0.92]: floor + (tended days / window days) · weight +
 * today's tier. "Tended" means a day that received ANY care — a check-in or a
 * goal touch — counted as distinct days, so intensity doesn't matter and can't
 * be gamed: ten touches in one day is one tended day.
 */
export function groveFullness(args: {
  daysTended: number;
  windowDays: number;
  todayTier: DayTier;
}): number {
  const { daysTended, windowDays, todayTier } = args;
  const fraction = windowDays > 0 ? clamp(daysTended / windowDays, 0, 1) : 0;
  return clamp(FLOOR + WINDOW_WEIGHT * fraction + TIER_BOOST[todayTier], FLOOR, 0.94);
}

/**
 * The tree's quiet name for itself (the SVG's aria-label). Words, never
 * numbers — and even the words describe form, not performance.
 */
export function groveLabel(fullness: number): string {
  if (fullness < 0.3) return "Your grove, still a sapling";
  if (fullness < 0.6) return "Your grove, taking root";
  return "Your grove, standing full";
}
