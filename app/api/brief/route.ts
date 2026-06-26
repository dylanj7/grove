// app/api/brief/route.ts
// ----------------------------------------------------------------
// GET /api/brief?slot=morning|evening
//
// Content-addressed: a brief is a pure function of its inputs, cached on a
// signature of those inputs. For a given (user_id, day, slot) the brief is
// generated once and holds perfectly still — identical on every open and every
// device — until the day's real material actually changes (a check-in created
// or edited, a tend, later Fitbit data). Then it regenerates exactly once.
//
// Any failure degrades to a cached or calm brief; it never 500s.
// ----------------------------------------------------------------

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { loadWindow } from "@/lib/window";
import { detectPatterns, windowSummary, type Pattern } from "@/lib/patterns";
import { generateBrief } from "@/lib/brief";

type Slot = "morning" | "evening";

function todayISO(): string {
  // UTC calendar day — the stable identity of "which day's brief".
  return new Date().toISOString().slice(0, 10);
}

// The "did anything real change?" detector: a fingerprint of exactly what
// generateBrief consumes. Same inputs → same signature → same brief, untouched.
function inputSignature(slot: Slot, summary: string, patterns: Pattern[]): string {
  const canonical = JSON.stringify({ slot, summary, patterns });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// The brief stores its patterns alongside the signature it was generated from.
type StoredEvidence = { patterns: Pattern[]; sig: string };

function readStored(evidence: unknown): { patterns: Pattern[]; sig?: string } {
  // New format is { patterns, sig }; legacy rows stored a bare Pattern[].
  if (Array.isArray(evidence)) return { patterns: evidence as Pattern[] };
  const e = (evidence ?? {}) as StoredEvidence;
  return { patterns: e.patterns ?? [], sig: e.sig };
}

export async function GET(request: Request) {
  const slot = new URL(request.url).searchParams.get("slot");
  if (slot !== "morning" && slot !== "evening") {
    return NextResponse.json(
      { error: "slot must be 'morning' or 'evening'" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const day = todayISO();

  try {
    // Compute the current inputs (and their signature) first — these are the
    // same inputs the brief is generated from.
    const win = await loadWindow(supabase, user.id);
    const patterns = detectPatterns(
      win.physical,
      win.checkins,
      win.touches,
      win.goals,
    );
    const summary = windowSummary(win.physical, win.checkins, win.goals);
    const signature = inputSignature(slot, summary, patterns);

    // Cache-first: the newest brief for this exact triple.
    const { data: existing } = await supabase
      .from("briefs")
      .select("headline, body, moves, evidence")
      .eq("user_id", user.id)
      .eq("day", day)
      .eq("slot", slot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Unchanged inputs → serve the same brief, no Claude call. The common path.
    if (existing) {
      const stored = readStored(existing.evidence);
      if (stored.sig === signature) {
        return NextResponse.json({
          headline: existing.headline,
          body: existing.body,
          moves: existing.moves ?? [],
          evidence: stored.patterns,
          cached: true,
        });
      }
    }

    // Miss or a real change → generate once, store with the new signature.
    const { brief, evidence } = await generateBrief({
      slot: slot as Slot,
      patterns,
      windowSummary: summary,
    });

    const storedEvidence: StoredEvidence = { patterns: evidence, sig: signature };
    const { error: insertError } = await supabase.from("briefs").insert({
      user_id: user.id,
      day,
      slot,
      headline: brief.headline,
      body: brief.body,
      moves: brief.moves,
      evidence: storedEvidence,
    });
    if (insertError) console.error("brief insert failed:", insertError.message);

    return NextResponse.json({
      headline: brief.headline,
      body: brief.body,
      moves: brief.moves,
      evidence,
      cached: false,
    });
  } catch (err) {
    console.error("brief generation failed:", err);

    // Prefer serving any cached brief over a fresh fallback, so a transient
    // failure doesn't make the brief flicker.
    const { data: fallbackRow } = await supabase
      .from("briefs")
      .select("headline, body, moves, evidence")
      .eq("user_id", user.id)
      .eq("day", day)
      .eq("slot", slot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackRow) {
      return NextResponse.json({
        headline: fallbackRow.headline,
        body: fallbackRow.body,
        moves: fallbackRow.moves ?? [],
        evidence: readStored(fallbackRow.evidence).patterns,
        cached: true,
      });
    }

    return NextResponse.json({
      headline:
        slot === "morning"
          ? "A fresh day. Tend what matters."
          : "Day's done. Set down how it felt.",
      body: "Couldn't read the grove just now. Nothing's lost — try again in a moment.",
      moves: [],
      evidence: [],
      cached: false,
    });
  }
}
