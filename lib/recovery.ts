// lib/recovery.ts
// ----------------------------------------------------------------
// The recovery score. Pure, deterministic, documented.
//
// Blends the physical signals we actually store — sleep duration,
// sleep efficiency, resting-HR delta, and HRV — into a single 0–100
// integer. Returns `null` when there's essentially nothing to score,
// rather than inventing a number.
//
// Note: sleep_efficiency is a stored 0–100 quality figure, scored
// absolutely (it's already normalized — 85% efficiency = 85 points),
// not against baseline like the ratio-based inputs.
// ----------------------------------------------------------------

export type RecoveryInput = {
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
};

export type RecoveryBaseline = {
  sleepMinutes: number | null;
  restingHr: number | null;
  hrvMs: number | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// 7.5h — used only when the user has no personal sleep baseline yet.
const DEFAULT_SLEEP_TARGET = 450;

// Components are anchored so that "right at your baseline" ≈ 85 (solid,
// not perfect), scaling up toward 100 above it and down toward 0 below.
const ANCHOR = 85;

// Sleep, HRV: more (vs baseline) is better.
function higherIsBetter(value: number, baseline: number): number {
  return clamp(Math.round((value / baseline) * ANCHOR), 0, 100);
}

// Resting HR: lower (vs baseline) is better, so invert the ratio.
function lowerIsBetter(value: number, baseline: number): number {
  return clamp(Math.round((2 - value / baseline) * ANCHOR), 0, 100);
}

/**
 * Compute a 0–100 recovery score, or `null` if nothing usable is present.
 *
 * Weights: sleep duration 0.35, sleep efficiency 0.15, resting-HR 0.25,
 * HRV 0.25. Only the components that have data (and, for HR/HRV, a baseline
 * to compare against) are included; the remaining weights are renormalized.
 * Sleep duration alone still yields a score, falling back to an absolute
 * target if there's no sleep baseline.
 */
export function computeRecovery(
  day: RecoveryInput,
  baseline: RecoveryBaseline,
): number | null {
  const parts: { score: number; weight: number }[] = [];

  if (day.sleep_minutes != null) {
    const base = baseline.sleepMinutes ?? DEFAULT_SLEEP_TARGET;
    parts.push({ score: higherIsBetter(day.sleep_minutes, base), weight: 0.35 });
  }

  // Sleep efficiency is already a 0–100 quality figure — score it directly,
  // no baseline. Contributes even before a personal baseline exists.
  if (day.sleep_efficiency != null) {
    parts.push({ score: clamp(Math.round(day.sleep_efficiency), 0, 100), weight: 0.15 });
  }

  // A resting-HR or HRV number is only meaningful relative to the person's
  // own baseline, so skip these components when no baseline exists.
  if (day.resting_hr != null && baseline.restingHr != null) {
    parts.push({ score: lowerIsBetter(day.resting_hr, baseline.restingHr), weight: 0.25 });
  }

  if (day.hrv_ms != null && baseline.hrvMs != null) {
    parts.push({ score: higherIsBetter(day.hrv_ms, baseline.hrvMs), weight: 0.25 });
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const blended = parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
  return clamp(Math.round(blended), 0, 100);
}
