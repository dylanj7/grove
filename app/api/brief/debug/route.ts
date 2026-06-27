// app/api/brief/debug/route.ts
// ----------------------------------------------------------------
// TEMPORARY diagnostic for the "brief keeps regenerating" bug. Read-only.
// Open in the browser (signed in): /api/brief/debug?slot=morning
//
// It reveals, for the current user:
//   - the REAL columns on the `briefs` table (from an actual stored row),
//   - whether stored rows carry `slot` and an evidence `sig`,
//   - the freshly computed signature + whether today's stored brief matches it,
//   - column-existence probes for the columns the cache path depends on.
//
// If `briefs` is missing a column the insert needs (e.g. `slot`), every insert
// silently fails and every read misses — so the brief regenerates forever.
// Delete this route once the cause is found.
// ----------------------------------------------------------------

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { loadWindow } from "@/lib/window";
import { detectPatterns, windowSummary, type Pattern } from "@/lib/patterns";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function inputSignature(slot: string, summary: string, patterns: Pattern[]): string {
  const sorted = [...patterns].sort((a, b) => a.code.localeCompare(b.code));
  return createHash("sha256").update(JSON.stringify({ slot, summary, patterns: sorted })).digest("hex").slice(0, 32);
}

export async function GET(request: Request) {
  const slot = new URL(request.url).searchParams.get("slot") ?? "morning";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated — sign in first" }, { status: 401 });

  const day = todayISO();

  // 1. The real briefs schema, straight from a stored row (if any exist).
  const { data: recentRows, error: rowsErr } = await supabase
    .from("briefs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const realColumns = recentRows && recentRows[0] ? Object.keys(recentRows[0]).sort() : null;
  const recentSummaries = (recentRows ?? []).map((r) => {
    const ev = r.evidence as unknown;
    return {
      day: r.day,
      slot: r.slot ?? "(no slot column / null)",
      created_at: r.created_at,
      evidenceType: Array.isArray(ev) ? "array(legacy)" : ev === null ? "null" : typeof ev,
      evidenceKeys: ev && typeof ev === "object" && !Array.isArray(ev) ? Object.keys(ev as object) : null,
      storedSig: ev && typeof ev === "object" && !Array.isArray(ev) ? (ev as { sig?: string }).sig ?? "(no sig key)" : "(n/a)",
    };
  });

  // 2. Probe each column the cache path touches.
  async function probe(col: string) {
    const { error } = await supabase.from("briefs").select(col).eq("user_id", user!.id).limit(1);
    return error ? `MISSING/ERROR: ${error.message}` : "ok";
  }
  const columnProbe: Record<string, string> = {};
  for (const col of ["slot", "day", "evidence", "moves", "headline", "body", "created_at"]) {
    columnProbe[col] = await probe(col);
  }

  // 3. The freshly computed signature, plus today's stored brief for this slot.
  let signature = "(error)";
  let summary = "";
  let patternCodes: string[] = [];
  let counts: Record<string, number> = {};
  let todayStored: unknown = null;
  let decision = "";
  try {
    const win = await loadWindow(supabase, user.id);
    const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals);
    summary = windowSummary(win.physical, win.checkins, win.goals, win.touches, day);
    signature = inputSignature(slot, summary, patterns);
    patternCodes = patterns.map((p) => p.code).sort();
    counts = {
      physical: win.physical.length,
      checkins: win.checkins.length,
      goals: win.goals.length,
      touches: win.touches.length,
      physicalDaysDistinct: new Set(win.physical.map((d) => d.day)).size,
    };

    const { data: existing, error: existErr } = await supabase
      .from("briefs")
      .select("evidence, created_at")
      .eq("user_id", user.id)
      .eq("day", day)
      .eq("slot", slot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existErr) {
      decision = `READ FAILED: ${existErr.message} → would regenerate every time`;
    } else if (!existing) {
      decision = "no stored brief for (user, today, slot) → would regenerate (then try to store)";
    } else {
      const ev = existing.evidence as { sig?: string } | Pattern[] | null;
      const storedSig = Array.isArray(ev) || !ev ? undefined : ev.sig;
      todayStored = { storedSig: storedSig ?? "(none)", created_at: existing.created_at };
      decision = storedSig === signature ? "MATCH → would serve cached (frozen) ✓" : "SIG MISMATCH → would regenerate ✗";
    }
  } catch (e) {
    decision = `loadWindow/signature threw: ${(e as Error).message}`;
  }

  return NextResponse.json(
    {
      day,
      slot,
      signature,
      decision,
      todayStored,
      realColumns,
      briefsRowReadError: rowsErr?.message ?? null,
      recentStoredBriefs: recentSummaries,
      columnProbe,
      counts,
      patternCodes,
      summary,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
