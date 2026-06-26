// app/api/brief/route.ts
// ----------------------------------------------------------------
// GET /api/brief?slot=morning|evening
//
// Auths the user, returns today's cached brief for that slot if one
// exists (never calls Claude twice for the same slot/day), otherwise
// reads the window → detects verified patterns → asks Claude to write
// the brief → caches it. Any failure degrades to a calm brief; it
// never 500s and breaks the morning.
// ----------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWindow } from "@/lib/window";
import { detectPatterns, windowSummary } from "@/lib/patterns";
import { generateBrief } from "@/lib/brief";

type Slot = "morning" | "evening";

function todayISO(): string {
  // UTC calendar day. Phase 1 keys briefs by UTC date; per-user timezone
  // is a later concern.
  return new Date().toISOString().slice(0, 10);
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

  // 1. Return an existing brief for (user, today, slot) — no second Claude call.
  const { data: existing } = await supabase
    .from("briefs")
    .select("headline, body, moves, evidence")
    .eq("user_id", user.id)
    .eq("day", day)
    .eq("slot", slot)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      headline: existing.headline,
      body: existing.body,
      moves: existing.moves ?? [],
      evidence: existing.evidence ?? [],
      cached: true,
    });
  }

  // 2. Generate fresh. Wrap everything so a failure is calm, not a 500.
  try {
    const win = await loadWindow(supabase, user.id);
    const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals);
    const summary = windowSummary(win.physical, win.checkins, win.goals);

    const { brief, evidence } = await generateBrief({
      slot: slot as Slot,
      patterns,
      windowSummary: summary,
    });

    // 3. Persist (best-effort — a write failure shouldn't deny the user their brief).
    const { error: insertError } = await supabase.from("briefs").insert({
      user_id: user.id,
      day,
      slot,
      headline: brief.headline,
      body: brief.body,
      moves: brief.moves,
      evidence,
    });
    if (insertError) {
      console.error("brief insert failed:", insertError.message);
    }

    return NextResponse.json({
      headline: brief.headline,
      body: brief.body,
      moves: brief.moves,
      evidence,
      cached: false,
    });
  } catch (err) {
    console.error("brief generation failed:", err);
    return NextResponse.json({
      headline:
        slot === "morning"
          ? "A fresh day. Tend what matters."
          : "Day's done. Log how it felt.",
      body: "Couldn't read the grove just now. Nothing's lost — try again in a moment.",
      moves: [],
      evidence: [],
      cached: false,
    });
  }
}
