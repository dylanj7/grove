// lib/physical.ts
// ----------------------------------------------------------------
// The physical reading — the one internal shape every physical signal
// flows through, whatever its source. Manual input produces one of these;
// the health seam (lib/health.ts → lib/health-google.ts) produces the band's
// reading (a superset, with activity) and persists it the same way. The
// recovery calc and the brief read merged readings; neither knows nor cares
// where a number came from. That source-blindness is what makes manual + band
// a merge, not a rebuild.
//
// Every metric is INDEPENDENTLY optional. A reading with sleep and resting HR
// but no HRV and no efficiency is a valid, usable reading — recovery degrades
// gracefully across whatever is present (see lib/recovery.ts).
// ----------------------------------------------------------------

// 'google_health' is the band (Google Health API — data from a Fitbit/Pixel
// device). 'fitbit' is kept for the original Phase 4 seam naming; nothing writes
// it anymore, but old rows or a future direct-Fitbit path would still validate.
export type PhysicalSource = "manual" | "fitbit" | "google_health";

// The measured metrics, each nullable on its own.
export type PhysicalMetrics = {
  sleep_minutes: number | null;
  sleep_efficiency: number | null; // stored 0–100 quality figure
  resting_hr: number | null;
  hrv_ms: number | null;
};

// A full reading for one (user, day), with provenance.
export type PhysicalReading = PhysicalMetrics & {
  day: string;
  source: PhysicalSource;
};

export const EMPTY_METRICS: PhysicalMetrics = {
  sleep_minutes: null,
  sleep_efficiency: null,
  resting_hr: null,
  hrv_ms: null,
};

// A reading is only worth storing if it carries at least one real number.
export function hasAnyMetric(m: PhysicalMetrics): boolean {
  return (
    m.sleep_minutes != null ||
    m.sleep_efficiency != null ||
    m.resting_hr != null ||
    m.hrv_ms != null
  );
}

// Manual input is entered in hours (the human unit); we store minutes (the
// unit recovery and the patterns reason in). One place owns the conversion.
export function hoursToMinutes(hours: number | null): number | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  return Math.round(hours * 60);
}

export function minutesToHours(minutes: number | null): number | null {
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return Math.round((minutes / 60) * 10) / 10; // one decimal, e.g. 7.5
}
