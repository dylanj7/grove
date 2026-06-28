// lib/health-google.ts
// ----------------------------------------------------------------
// EVERYTHING GOOGLE-SPECIFIC LIVES HERE — the hedge (PHASE5 §8).
//
// The Google Health API is pre-GA: scope identifiers and dataType/response
// shapes may still shift before GA, and all Health scopes are *Restricted*
// (they need Google's privacy review before a public launch — that couples to
// Phase 6, not this phase). So we quarantine every Google detail in this one
// file. lib/health.ts (the provider-neutral seam) calls these functions and
// knows nothing about OAuth params, scope strings, or v4 URL shapes. If Google
// renames a scope or reshapes a payload at GA, this file changes and nothing
// above it does.
//
// Two defensive postures, on purpose:
//   1. Scopes are overridable via GOOGLE_HEALTH_SCOPES (space-separated) so a
//      pre-GA rename can be fixed without a deploy — scope drift is what blocks
//      the consent screen, so it's the most valuable thing to make adjustable.
//   2. Data mapping NEVER throws upward: an unexpected payload degrades to an
//      absent metric (the recovery layer and brief already handle absence — a
//      gap reads as a gap, never a fabricated number). A reshape at GA makes the
//      body coarser, never broken.
// ----------------------------------------------------------------

import { OAuth2Client } from "google-auth-library";
import type { PhysicalSource } from "./physical";

const V4 = "https://health.googleapis.com/v4";

// What the band hands back for one civil day. A superset of the recovery metrics
// (PhysicalMetrics) plus activity, mapping 1:1 onto the physical_days columns —
// so the seam can persist it directly. Activity (steps / active minutes) rides
// here too: it's honest brief signal, not a recovery input, so it lives on the
// reading but never touches recovery.ts.
export type BandReading = {
  day: string;
  source: PhysicalSource; // always 'google_health' from this provider
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  steps: number | null;
  active_minutes: number | null;
};

// ---- Config (server-only; the secret never reaches the browser) ----
export function googleConfig() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  return { clientId, clientSecret, redirectUri };
}

export function googleConfigured(): boolean {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  return Boolean(clientId && clientSecret && redirectUri);
}

// ---- Scopes (PHASE5 §4: request only what Grove uses) ----
// Read-only bundles covering sleep, heart rate + daily resting HR + daily HRV,
// and activity. Google consolidated Fitbit's ~15 scopes into functional
// bundles; these are the current best-known identifiers. VERIFY at build time
// against developers.google.com/health/data-types (and the scopes page) — they
// are still consolidating. We request NOTHING beyond recovery + daily activity
// (no weight, nutrition, location, reproductive) — a privacy posture AND what
// keeps the eventual Restricted-scope review tractable.
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/health.sleep.read",
  "https://www.googleapis.com/auth/health.heart_rate.read",
  "https://www.googleapis.com/auth/health.resting_heart_rate.read",
  "https://www.googleapis.com/auth/health.heart_rate_variability.read",
  "https://www.googleapis.com/auth/health.activity.read",
];

export function scopes(): string[] {
  const override = process.env.GOOGLE_HEALTH_SCOPES?.trim();
  return override ? override.split(/\s+/).filter(Boolean) : DEFAULT_SCOPES;
}

function client(): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

// ---- Tokens — the provider-neutral shape the seam persists ----
export type GoogleTokens = {
  accessToken: string;
  // Google may or may not rotate the refresh token; null means "keep the one we
  // already have" (the seam preserves the stored one when this is null).
  refreshToken: string | null;
  scope: string | null;
  expiresAt: string | null; // ISO
};

function toTokens(c: {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  expiry_date?: number | null;
}): GoogleTokens {
  return {
    accessToken: c.access_token ?? "",
    refreshToken: c.refresh_token ?? null,
    scope: c.scope ?? null,
    expiresAt: c.expiry_date ? new Date(c.expiry_date).toISOString() : null,
  };
}

// ---- Leg 1: the consent URL ----
// access_type=offline is REQUIRED to receive a refresh token; prompt=consent
// ensures one is returned even on re-auth. Getting these right here is what
// prevents the classic "no refresh token issued" reconnect loop (§6).
export function authUrl(state: string): string {
  return client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: scopes(),
    state,
  });
}

// ---- Leg 2: code -> tokens ----
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const { tokens } = await client().getToken(code);
  return toTokens(tokens);
}

// ---- Leg 3: refresh. Throws GoogleAuthRevoked when the grant is gone. ----
export class GoogleAuthRevoked extends Error {}

export async function refresh(refreshToken: string): Promise<GoogleTokens> {
  const c = client();
  c.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await c.refreshAccessToken();
    // Google often omits the refresh token on refresh; preserve the old one
    // upstream by leaving refreshToken null when absent.
    return toTokens({ ...credentials, refresh_token: credentials.refresh_token ?? null });
  } catch (err: unknown) {
    // invalid_grant = the user revoked access, or no refresh token was ever
    // issued. Either way the connection needs re-establishing, not retrying.
    const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
    if (data?.error === "invalid_grant") {
      throw new GoogleAuthRevoked("refresh token invalid or revoked");
    }
    throw err;
  }
}

// ---- Identity: the provider user id, for provenance (best-effort) ----
// Nice to have, never required — a connection works without it, so a failure
// here returns null rather than aborting the connect.
export async function getIdentity(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${V4}/users/me:getIdentity`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { userId?: string; id?: string; name?: string };
    return json.userId ?? json.id ?? json.name ?? null;
  } catch {
    return null;
  }
}

// ================================================================
// THE DATA. One URL template, varying {type} and the filter (§5).
//   GET {V4}/users/me/dataTypes/{type}/dataPoints[:method]?filter=...
//
// The dataType identifiers and "kind" below drive the filter field and read
// method. These are the current best-known v4 names; VERIFY at GA. Each kind:
//   session  (sleep)            -> :reconcile, filter on .interval.end_time
//   daily    (resting HR, HRV)  -> per-day list,  filter on .date
//   interval (steps, active)    -> :reconcile, filter on .interval.start_time
// Grove wants ONE honest figure per day, not intraday samples, and :reconcile
// lets Google merge multiple devices (Pixel + Fitbit) into one clean stream so
// Grove writes no dedupe logic.
// ================================================================
type Kind = "session" | "daily" | "interval";
type TypeSpec = { type: string; kind: Kind };

const TYPES = {
  sleep: { type: "sleep", kind: "session" } as TypeSpec,
  restingHr: { type: "resting_heart_rate", kind: "daily" } as TypeSpec,
  hrv: { type: "heart_rate_variability", kind: "daily" } as TypeSpec,
  steps: { type: "steps", kind: "interval" } as TypeSpec,
  active: { type: "active_minutes", kind: "interval" } as TypeSpec,
};

// A single civil day to fetch, with its UTC bounds (computed by the seam from
// the user's local timezone so a night lands on the right local day — §5).
export type DayWindow = { day: string; startISO: string; endISO: string };

type DataPoint = Record<string, unknown>;

function filterFor(spec: TypeSpec, w: DayWindow): string {
  const t = spec.type;
  switch (spec.kind) {
    case "session":
      return `${t}.interval.end_time >= "${w.startISO}" AND ${t}.interval.end_time < "${w.endISO}"`;
    case "interval":
      return `${t}.interval.start_time >= "${w.startISO}" AND ${t}.interval.start_time < "${w.endISO}"`;
    case "daily":
      return `${t}.date = "${w.day}"`;
  }
}

// One read. Returns the dataPoints, or [] on ANY failure — a fetch that can't be
// read is an absent metric, never a thrown error into the brief.
async function readPoints(
  accessToken: string,
  spec: TypeSpec,
  w: DayWindow,
): Promise<DataPoint[]> {
  // Daily aggregates have one value per day → a plain filtered list. Session and
  // interval streams can span devices → :reconcile merges them.
  const method = spec.kind === "daily" ? "" : ":reconcile";
  const url =
    `${V4}/users/me/dataTypes/${encodeURIComponent(spec.type)}/dataPoints${method}` +
    `?filter=${encodeURIComponent(filterFor(spec, w))}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { dataPoints?: DataPoint[] };
    return Array.isArray(json.dataPoints) ? json.dataPoints : [];
  } catch {
    return [];
  }
}

// ---- Defensive field readers (tolerate the payload drifting at GA) ----
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Read the first present value among candidate paths on a point's value/summary.
function pick(p: DataPoint, paths: string[]): number | null {
  for (const path of paths) {
    const v = num(get(p, path)) ?? num(get(p, `value.${path}`)) ?? num(get(p, `summary.${path}`));
    if (v != null) return v;
  }
  return null;
}

// Fetch one day across all five types and fold into a single BandReading.
// Returns null if the day yielded nothing usable (so the seam writes no empty
// row). source is 'google_health' so precedence is explicit downstream.
async function readingForDay(
  accessToken: string,
  w: DayWindow,
): Promise<BandReading | null> {
  const [sleepPts, rhrPts, hrvPts, stepPts, activePts] = await Promise.all([
    readPoints(accessToken, TYPES.sleep, w),
    readPoints(accessToken, TYPES.restingHr, w),
    readPoints(accessToken, TYPES.hrv, w),
    readPoints(accessToken, TYPES.steps, w),
    readPoints(accessToken, TYPES.active, w),
  ]);

  // Sleep: sum minutes asleep across sessions; efficiency from the field or the
  // asleep/in-bed ratio when the field is absent.
  let sleepMinutes: number | null = null;
  let asleepSum = 0;
  let periodSum = 0;
  let effField: number | null = null;
  for (const p of sleepPts) {
    const asleep = pick(p, ["minutesAsleep", "minutes_asleep"]);
    const period = pick(p, ["minutesInSleepPeriod", "minutes_in_bed", "timeInBed"]);
    const eff = pick(p, ["efficiency"]);
    if (asleep != null) asleepSum += asleep;
    if (period != null) periodSum += period;
    if (eff != null) effField = eff;
  }
  if (asleepSum > 0) sleepMinutes = Math.round(asleepSum);
  let sleepEfficiency: number | null =
    effField != null
      ? Math.round(effField)
      : periodSum > 0 && asleepSum > 0
        ? Math.round((asleepSum / periodSum) * 100)
        : null;
  if (sleepEfficiency != null) sleepEfficiency = Math.max(0, Math.min(100, sleepEfficiency));

  // Resting HR / HRV: one daily value (take the first usable point).
  const restingHr = rhrPts.map((p) => pick(p, ["bpm", "value", "restingHeartRate"])).find((v) => v != null) ?? null;
  const hrvMs = hrvPts.map((p) => pick(p, ["rmssd", "millis", "value", "hrv"])).find((v) => v != null) ?? null;

  // Steps / active minutes: sum across the day's interval points.
  const stepsSum = stepPts.reduce<number>((s, p) => s + (pick(p, ["countSum", "count", "steps"]) ?? 0), 0);
  const steps = stepPts.length ? Math.round(stepsSum) : null;
  const activeSum = activePts.reduce<number>((s, p) => s + (pick(p, ["minutes", "activeMinutes", "count"]) ?? 0), 0);
  const activeMinutes = activePts.length ? Math.round(activeSum) : null;

  const reading: BandReading = {
    day: w.day,
    source: "google_health",
    sleep_minutes: sleepMinutes,
    sleep_efficiency: sleepEfficiency,
    resting_hr: restingHr != null ? Math.round(restingHr) : null,
    hrv_ms: hrvMs != null ? Math.round(hrvMs) : null,
    steps,
    active_minutes: activeMinutes,
  };

  const anything =
    reading.sleep_minutes != null ||
    reading.sleep_efficiency != null ||
    reading.resting_hr != null ||
    reading.hrv_ms != null ||
    reading.steps != null ||
    reading.active_minutes != null;
  return anything ? reading : null;
}

// Fetch readings for several civil days at once. One failed day doesn't sink the
// rest. The seam decides WHICH days to ask for (lazy, per-day cached — §5).
export async function fetchReadings(
  accessToken: string,
  windows: DayWindow[],
): Promise<BandReading[]> {
  const results = await Promise.all(windows.map((w) => readingForDay(accessToken, w)));
  return results.filter((r): r is BandReading => r !== null);
}
