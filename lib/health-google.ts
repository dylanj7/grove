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
// Google Health consolidated Fitbit's ~15 scopes into functional BUNDLES, named
// googlehealth.{bundle}.readonly. Grove needs exactly three:
//   - activity_and_fitness            → steps + active minutes
//   - health_metrics_and_measurements → heart rate, resting HR, HRV
//   - sleep                           → sleep
// That's the whole recovery + daily-activity surface and nothing more (no
// weight, nutrition, location, reproductive) — a privacy posture AND what keeps
// the eventual Restricted-scope review tractable. These three were confirmed
// against the live Google Cloud Data Access scope picker on 2026-06-28 and are
// registered there; they must match exactly.
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
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
//
// NO include_granted_scopes: incremental auth would union in any legacy Google
// Fit scopes the account ever granted, and the Health authorization layer
// rejects the mix — it manifests as data reads failing AFTER a clean connect.
// Request only the Health bundles, nothing inherited.
export function authUrl(state: string): string {
  return client().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
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

// `type` is the snake_case dataType id used in the FILTER. The URL path needs
// the kebab-case form (readPoints derives it). For HR/HRV we want the DAILY
// aggregate types (daily_resting_heart_rate / daily_heart_rate_variability) —
// the plain heart_rate_variability is a Sample type with no daily roll-up.
// Confirmed against Google's official data-types table 2026-06-29.
const TYPES = {
  sleep: { type: "sleep", kind: "session" } as TypeSpec,
  restingHr: { type: "daily_resting_heart_rate", kind: "daily" } as TypeSpec,
  hrv: { type: "daily_heart_rate_variability", kind: "daily" } as TypeSpec,
  steps: { type: "steps", kind: "interval" } as TypeSpec,
  active: { type: "active_minutes", kind: "interval" } as TypeSpec,
};

// A single civil day to fetch, with its UTC bounds (computed by the seam from
// the user's local timezone so a night lands on the right local day — §5).
export type DayWindow = { day: string; startISO: string; endISO: string };

type DataPoint = Record<string, unknown>;

// The civil day after `day`, as YYYY-MM-DD. .date is a civil date, not a
// timestamp, so this is plain UTC date arithmetic on the date string.
function nextCivilDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function filterFor(spec: TypeSpec, w: DayWindow): string {
  const t = spec.type;
  switch (spec.kind) {
    case "session":
      return `${t}.interval.end_time >= "${w.startISO}" AND ${t}.interval.end_time < "${w.endISO}"`;
    case "interval":
      return `${t}.interval.start_time >= "${w.startISO}" AND ${t}.interval.start_time < "${w.endISO}"`;
    case "daily":
      // Daily types only support >= and < on .date (not =). Express one civil
      // day as the half-open range [day, nextDay), comparing against civil date
      // strings — never the ISO datetimes the session/interval filters use.
      return `${t}.date >= "${w.day}" AND ${t}.date < "${nextCivilDay(w.day)}"`;
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
  // The dataType id must be KEBAB-case in the URL path but SNAKE-case in the
  // filter (Google's docs are explicit about this). Single-word types are
  // identical in both; multi-word types (daily-resting-heart-rate) failed
  // because the snake_case form was sent in the path.
  const pathType = spec.type.replace(/_/g, "-");
  const url =
    `${V4}/users/me/dataTypes/${pathType}/dataPoints${method}` +
    `?filter=${encodeURIComponent(filterFor(spec, w))}`;
  // TEMPORARY diagnostics: the dataType names and filters are unverified guesses
  // against the pre-GA v4 API, so log the request and any failure to the Vercel
  // function logs while we confirm the TYPES map. Remove once confirmed.
  console.error("[health read] GET", url);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[health read] FAILED", spec.type, spec.kind, res.status, await res.text());
      return [];
    }
    const json = (await res.json()) as { dataPoints?: DataPoint[] };
    // TEMPORARY: log the raw 200 body so we can see whether dataPoints is truly
    // empty or the points live under a different key (e.g. reconcile wrapping).
    console.error("[health read OK]", spec.type, JSON.stringify(json).slice(0, 1000));
    return Array.isArray(json.dataPoints) ? json.dataPoints : [];
  } catch {
    return [];
  }
}

// ---- Defensive field readers (tolerate the payload drifting at GA) ----
// v4 responses are protobuf-JSON: int64 fields (bpm, counts, minute tallies)
// arrive as STRINGS ("56", "5"), while double fields (HRV milliseconds) arrive
// as real numbers. num() accepts either. Confirmed against live 2026-07-03
// response bodies — see the per-type extractors below, each keyed to the
// dataType's own field name (the wire shape is NOT a generic {value/summary}
// envelope, as first assumed; every type nests its payload under a field
// matching its own camelCase name, e.g. `dailyHeartRateVariability`).
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Daily HRV: { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds } }
function extractHrv(points: DataPoint[]): number | null {
  for (const p of points) {
    const v = num(get(p, "dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds"));
    if (v != null) return Math.round(v);
  }
  return null;
}

// Daily resting HR: { dailyRestingHeartRate: { beatsPerMinute } } (string)
function extractRestingHr(points: DataPoint[]): number | null {
  for (const p of points) {
    const v = num(get(p, "dailyRestingHeartRate.beatsPerMinute"));
    if (v != null) return Math.round(v);
  }
  return null;
}

// Steps: many per-minute interval points, { steps: { count } } (string) each —
// sum across the day. null (not 0) when the band recorded nothing, so an
// honest "no reading" never gets confused with a real zero-step day.
function extractSteps(points: DataPoint[]): number | null {
  if (points.length === 0) return null;
  let sum = 0;
  for (const p of points) sum += num(get(p, "steps.count")) ?? 0;
  return Math.round(sum);
}

// Active minutes: many per-minute interval points, each
// { activeMinutes: { activeMinutesByActivityLevel: [{ activityLevel, activeMinutes }] } }
// (activeMinutes a string). The type is already the band's own "active
// minutes" stream (there's no sedentary entry to filter out) — sum every
// level across every point.
function extractActiveMinutes(points: DataPoint[]): number | null {
  if (points.length === 0) return null;
  let sum = 0;
  for (const p of points) {
    const levels = get(p, "activeMinutes.activeMinutesByActivityLevel");
    if (!Array.isArray(levels)) continue;
    for (const lvl of levels) sum += num(get(lvl, "activeMinutes")) ?? 0;
  }
  return Math.round(sum);
}

// Sleep: each dataPoint is ONE session, { sleep: { stages: [{ type, startTime,
// endTime }] } } — no summary field at all. Asleep = every stage whose type
// isn't AWAKE; the period (for efficiency) is every stage's span, summed.
// Multiple sessions in a day (a nap + the main sleep) accumulate together.
function extractSleep(points: DataPoint[]): { minutes: number | null; efficiency: number | null } {
  let asleepMs = 0;
  let periodMs = 0;
  let any = false;
  for (const p of points) {
    const stages = get(p, "sleep.stages");
    if (!Array.isArray(stages)) continue;
    for (const s of stages) {
      const start = Date.parse(String(get(s, "startTime") ?? ""));
      const end = Date.parse(String(get(s, "endTime") ?? ""));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const ms = end - start;
      periodMs += ms;
      if (String(get(s, "type") ?? "").toUpperCase() !== "AWAKE") asleepMs += ms;
      any = true;
    }
  }
  if (!any) return { minutes: null, efficiency: null };
  const minutes = Math.round(asleepMs / 60_000);
  const efficiency =
    periodMs > 0 ? Math.max(0, Math.min(100, Math.round((asleepMs / periodMs) * 100))) : null;
  return { minutes, efficiency };
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

  const { minutes: sleepMinutes, efficiency: sleepEfficiency } = extractSleep(sleepPts);

  const reading: BandReading = {
    day: w.day,
    source: "google_health",
    sleep_minutes: sleepMinutes,
    sleep_efficiency: sleepEfficiency,
    resting_hr: extractRestingHr(rhrPts),
    hrv_ms: extractHrv(hrvPts),
    steps: extractSteps(stepPts),
    active_minutes: extractActiveMinutes(activePts),
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
