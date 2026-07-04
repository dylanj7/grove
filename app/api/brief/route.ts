// app/api/brief/route.ts
// ----------------------------------------------------------------
// GET /api/brief?slot=morning|evening&day=YYYY-MM-DD&tz=<offsetMin>
//
// The brief READ now lives in lib/brief-read.ts, shared with the /today Server
// Component (which renders it on first paint, no client flash). This route is
// the FRESHNESS wrapper the page cannot do inline: it syncs the band BEFORE the
// read, so new readings fold into the window — and thus the content signature —
// regenerating the brief exactly once. /today calls this AFTER paint to pull any
// freshly-synced numbers without stalling its render.
//
// Any failure degrades to a cached or calm brief; it never 500s.
// ----------------------------------------------------------------

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readBrief, readStored } from "@/lib/brief-read";
import { syncHealth } from "@/lib/health";
import { isValidDay, todayISO } from "@/lib/date";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slot = params.get("slot");
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

  // The client passes its LOCAL day and timezone offset (getTimezoneOffset) so a
  // band sync lands each night's data on the right civil day (§5). Falls back to
  // the UTC day / UTC basis when absent — the brief's own day key stays UTC.
  const localDay = (() => {
    const d = params.get("day");
    return d && isValidDay(d) ? d : day;
  })();
  const tzOffsetMin = (() => {
    const n = Number(params.get("tz"));
    return Number.isInteger(n) && Math.abs(n) <= 840 ? n : 0;
  })();

  try {
    // If a band is connected, pull today's data BEFORE reading, so new readings
    // fold into the window (and thus the signature), regenerating the brief
    // exactly once. The sync is lazy and per-day cached: a day already stored is
    // not re-fetched, so a plain reopen writes nothing and the brief stays
    // frozen. Best-effort — a sync failure must never break the brief. (Its side
    // effect of flipping needs_reconnect in the DB is what readBrief then reads.)
    await syncHealth(supabase, user.id, {
      today: localDay,
      tzOffsetMin,
      lookbackDays: 2,
    }).catch(() => {});

    const brief = await readBrief(supabase, user.id, slot, localDay);
    return NextResponse.json(brief);
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
        tend: { habits: [], goals: [] },
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
      tend: { habits: [], goals: [] },
      cached: false,
    });
  }
}
