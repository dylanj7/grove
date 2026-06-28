// lib/health.ts
// ----------------------------------------------------------------
// THE PROVIDER-NEUTRAL SEAM (replaces the Phase 4 lib/fitbit.ts stub).
//
// Everything ABOVE this file — recovery, the brief, the window, the UI — stays
// source-blind: it reads merged physical readings and never learns they came
// from a band. Everything Google-specific (OAuth params, scope strings, the v4
// API) lives one level down in lib/health-google.ts. This file is the hinge:
// the token store, token refresh-and-persist, connection state, the lazy
// per-day sync that writes a band reading into physical_days, and disconnect.
//
// All DB access goes through the caller's RLS-bound Supabase client (own-rows),
// exactly like the manual path — the seam writes the user's own rows, nothing
// more. The provider is Google Health; the device is usually a Fitbit/Pixel.
// ----------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authUrl,
  exchangeCode,
  fetchReadings,
  getIdentity,
  googleConfigured,
  refresh,
  GoogleAuthRevoked,
  type BandReading,
  type DayWindow,
} from "./health-google";

const TABLE = "health_connections";

// Re-export so callers (routes) can gate the connect action on config presence
// without importing the Google module directly.
export { googleConfigured };

export type ConnectionState = "disconnected" | "connected" | "needs_reconnect";

type ConnectionRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  oauth_state: string | null;
  needs_reconnect: boolean | null;
};

async function readRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectionRow | null> {
  const { data } = await supabase
    .from(TABLE)
    .select("access_token, refresh_token, expires_at, oauth_state, needs_reconnect")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

// The honest state of the connection, read WITHOUT calling Google — Settings
// needs it on every render. "connected" requires real tokens and no pending
// reconnect; a mid-handshake row (state set, no tokens yet) reads as
// disconnected, which is the truth until the callback completes.
export async function connectionState(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectionState> {
  const row = await readRow(supabase, userId);
  if (!row || !row.access_token) return "disconnected";
  if (row.needs_reconnect) return "needs_reconnect";
  return "connected";
}

// ---- Leg 1: begin connect. Mint CSRF state, persist it keyed to the user,
// return the consent URL. Upsert touches only the state columns, so a reconnect
// doesn't disturb existing tokens until the callback swaps them. ----
export async function beginConnect(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const state = crypto.randomUUID();
  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      oauth_state: state,
      oauth_state_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`could not start connect: ${error.message}`);
  return authUrl(state);
}

export type CompleteResult =
  | { ok: true }
  | { ok: false; reason: "state_mismatch" | "exchange_failed" };

// ---- Leg 2: complete connect. Verify state, exchange the code, capture the
// provider identity, persist tokens. State is single-use: cleared on success. ----
export async function completeConnect(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  state: string,
): Promise<CompleteResult> {
  const row = await readRow(supabase, userId);
  // Reject on a missing or mismatched state — this is the CSRF guard.
  if (!row || !row.oauth_state || row.oauth_state !== state) {
    return { ok: false, reason: "state_mismatch" };
  }

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch {
    return { ok: false, reason: "exchange_failed" };
  }
  if (!tokens.accessToken) return { ok: false, reason: "exchange_failed" };

  const identity = await getIdentity(tokens.accessToken); // best-effort

  const { error } = await supabase
    .from(TABLE)
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken, // present on first consent
      scope: tokens.scope,
      expires_at: tokens.expiresAt,
      fitbit_user_id: identity,
      provider: "google_health",
      needs_reconnect: false,
      oauth_state: null,
      oauth_state_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) return { ok: false, reason: "exchange_failed" };
  return { ok: true };
}

// ---- Leg 3: a valid access token, refreshing+persisting on the data path.
// Returns null when there's nothing usable (disconnected, or the grant is gone
// — in which case we flag needs_reconnect so Settings can prompt calmly). ----
async function validAccessToken(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const row = await readRow(supabase, userId);
  if (!row || !row.access_token || row.needs_reconnect) return null;

  // Still fresh (with a small skew window)? Use it as-is.
  const SKEW_MS = 60_000;
  const expired =
    !row.expires_at || Date.parse(row.expires_at) - Date.now() < SKEW_MS;
  if (!expired) return row.access_token;

  // Expired: refresh. THE classic bug is refreshing without persisting, so the
  // next call re-expires — so we persist whatever comes back, every time.
  if (!row.refresh_token) {
    await markNeedsReconnect(supabase, userId);
    return null;
  }
  try {
    const t = await refresh(row.refresh_token);
    await supabase
      .from(TABLE)
      .update({
        access_token: t.accessToken,
        expires_at: t.expiresAt,
        // Google may rotate the refresh token or not — save a new one if given,
        // otherwise keep the one we have (don't overwrite with null).
        ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}),
        ...(t.scope ? { scope: t.scope } : {}),
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return t.accessToken || null;
  } catch (err) {
    if (err instanceof GoogleAuthRevoked) {
      await markNeedsReconnect(supabase, userId);
      return null;
    }
    // Transient network/refresh failure: don't flag reconnect (the grant may be
    // fine); just degrade to absent for this read.
    return null;
  }
}

async function markNeedsReconnect(supabase: SupabaseClient, userId: string) {
  await supabase
    .from(TABLE)
    .update({ needs_reconnect: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

// ---- The civil-day → UTC-bounds map (PHASE5 §5 local-date discipline) ----
// tzOffsetMin is the client's Date.getTimezoneOffset() (minutes; positive =
// behind UTC). Local midnight of civil day D, in UTC, is D 00:00Z + that offset.
// Defaults to 0 (UTC) when no client offset is available (e.g. the connect
// callback's first backfill), which is the same basis the brief's day key uses.
function dayWindow(day: string, tzOffsetMin: number): DayWindow {
  const baseUTC = Date.parse(`${day}T00:00:00Z`);
  const startMs = baseUTC + tzOffsetMin * 60_000;
  const endMs = startMs + 24 * 60 * 60_000;
  return {
    day,
    startISO: new Date(startMs).toISOString(),
    endISO: new Date(endMs).toISOString(),
  };
}

function dayStrings(today: string, lookbackDays: number): string[] {
  const base = Date.parse(`${today}T00:00:00Z`);
  const out: string[] = [];
  for (let i = 0; i <= lookbackDays; i++) {
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out; // newest-first
}

export type SyncStatus =
  | "disconnected"
  | "needs_reconnect"
  | "synced"
  | "skipped"
  | "error";

export type SyncOptions = {
  today: string; // the civil day to treat as "today" (local, from the client)
  tzOffsetMin?: number; // client getTimezoneOffset(); 0 = UTC basis
  lookbackDays?: number; // how many prior days to consider
  force?: boolean; // re-pull even days already cached (a manual refresh / connect)
};

// ---- The lazy, per-day-cached sync (PHASE5 §5 wiring + rate limits) ----
// Writes the band's reading into physical_days as its own provider-sourced row,
// alongside (never overwriting) the manual row. Crucially LAZY: a day already
// stored is NOT re-fetched unless force=true — so repeated brief reads on the
// same day touch nothing, the window stays byte-identical, and the brief stays
// frozen. A genuinely new day (or a forced refresh) is the only thing that
// writes, which is exactly the "new data regenerates the brief once" rule.
export async function syncHealth(
  supabase: SupabaseClient,
  userId: string,
  opts: SyncOptions,
): Promise<SyncStatus> {
  if (!googleConfigured()) return "disconnected";

  const state = await connectionState(supabase, userId);
  if (state === "disconnected") return "disconnected";
  if (state === "needs_reconnect") return "needs_reconnect";

  const token = await validAccessToken(supabase, userId);
  if (!token) {
    // validAccessToken flips needs_reconnect when the grant is gone.
    return (await connectionState(supabase, userId)) === "needs_reconnect"
      ? "needs_reconnect"
      : "error";
  }

  const tzOffsetMin = opts.tzOffsetMin ?? 0;
  const lookbackDays = opts.lookbackDays ?? 2;
  const candidates = dayStrings(opts.today, lookbackDays);

  // Lazy: drop days we already have a provider row for (unless forcing).
  let days = candidates;
  if (!opts.force) {
    const { data: existing } = await supabase
      .from("physical_days")
      .select("day")
      .eq("user_id", userId)
      .eq("source", "google_health")
      .in("day", candidates);
    const have = new Set((existing ?? []).map((r: { day: string }) => r.day));
    days = candidates.filter((d) => !have.has(d));
  }
  if (days.length === 0) return "skipped";

  let readings: BandReading[];
  try {
    readings = await fetchReadings(token, days.map((d) => dayWindow(d, tzOffsetMin)));
  } catch {
    return "error";
  }
  if (readings.length === 0) return "skipped";

  // Upsert each as the provider row. recovery_score is left null so the window
  // recomputes it from the MERGED (manual + band) metrics — same discipline as
  // the manual save path.
  const rows = readings.map((r) => ({
    user_id: userId,
    day: r.day,
    source: r.source,
    sleep_minutes: r.sleep_minutes,
    sleep_efficiency: r.sleep_efficiency,
    resting_hr: r.resting_hr,
    hrv_ms: r.hrv_ms,
    steps: r.steps,
    active_minutes: r.active_minutes,
    recovery_score: null,
  }));
  const { error } = await supabase
    .from("physical_days")
    .upsert(rows, { onConflict: "user_id,day,source" });
  if (error) return "error";
  return "synced";
}

// ---- Disconnect: a clean, honest fall-back to manual (PHASE5 §6) ----
// Delete the token row AND the band-sourced readings, so nothing Google lingers:
// no orphaned tokens, and no stale band number left to shadow a future manual
// entry for the same day. The user's OWN (manual) readings are untouched.
export async function disconnect(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean }> {
  const { error: pErr } = await supabase
    .from("physical_days")
    .delete()
    .eq("user_id", userId)
    .eq("source", "google_health");
  const { error: cErr } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId);
  return { ok: !pErr && !cErr };
}
