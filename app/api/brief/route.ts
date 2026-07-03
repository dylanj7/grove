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
import { loadWindow, type WindowData } from "@/lib/window";
import { detectPatterns, windowSummary, type Pattern } from "@/lib/patterns";
import { generateBrief } from "@/lib/brief";
import { syncHealth } from "@/lib/health";
import { isValidDay } from "@/lib/date";

type Slot = "morning" | "evening";

function todayISO(): string {
  // UTC calendar day — the stable identity of "which day's brief".
  return new Date().toISOString().slice(0, 10);
}

// The "did anything real change?" detector: a fingerprint of exactly what
// generateBrief consumes. Same inputs → same signature → same brief, untouched.
// Patterns are sorted by code first so the fingerprint can't depend on the order
// the detector happened to emit them — only on WHICH patterns are present and
// what they say. (Belt-and-suspenders with loadWindow's deterministic ordering.)
function inputSignature(slot: Slot, summary: string, patterns: Pattern[]): string {
  const sorted = [...patterns].sort((a, b) => a.code.localeCompare(b.code));
  const canonical = JSON.stringify({ slot, summary, patterns: sorted });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// The deterministic "what to tend today" reminders — a plain read of the user's
// current goals and habits, never the model. A deterministic list cannot
// regenerate differently, so it is frozen by construction (Phase 4.5 §3a).
function tendList(goals: WindowData["goals"], touches: WindowData["touches"]) {
  const recentByGoal = new Map<string, string[]>();
  for (const t of touches) {
    const arr = recentByGoal.get(t.goal_id) ?? [];
    arr.push(t.day);
    recentByGoal.set(t.goal_id, arr);
  }
  const active = goals.filter((g) => g.status === "active");
  return {
    habits: active
      .filter((g) => g.kind === "habit")
      .map((g) => ({ id: g.id, title: g.title, aspect: g.aspect, recentDays: recentByGoal.get(g.id) ?? [] })),
    goals: active
      .filter((g) => g.kind === "goal")
      .map((g) => ({ id: g.id, title: g.title, aspect: g.aspect })),
  };
}

// ---- The correspondence (the letters remember each other) ----
// A morning brief may look back at yesterday evening's letter; an evening brief
// looks back at this morning's, plus what actually got tended today. Both are
// plain stored/derived facts folded into the summary — so they're part of the
// content signature (a changed predecessor regenerates the brief once, then it
// freezes), and the hard rules still apply: the model may only speak to what's
// on the page.
function prevDayISO(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}

function letterLine(
  slot: Slot,
  prev: { headline: string; moves: unknown } | null,
): string {
  if (!prev?.headline) return "";
  const moves = (Array.isArray(prev.moves) ? prev.moves : [])
    .map((m) => (m as { text?: string })?.text)
    .filter((t): t is string => Boolean(t));
  const opened = slot === "morning" ? "Yesterday evening's letter" : "This morning's letter";
  const pointed = moves.length ? ` It pointed at: ${moves.map((t) => `"${t}"`).join("; ")}.` : "";
  return `\n${opened} read: "${prev.headline}"${pointed}`;
}

// What today's tending actually came to — the evening's loop-closing facts.
// Sorted so the line is a pure function of WHICH tends exist, never row order.
function tendedTodayLine(win: WindowData, day: string): string {
  const touchedToday = new Set(win.touches.filter((t) => t.day === day).map((t) => t.goal_id));
  const active = win.goals.filter((g) => g.status === "active");
  const tended = active
    .filter((g) => touchedToday.has(g.id))
    .map((g) => `"${g.title}"`)
    .sort();
  const untendedDaily = active
    .filter((g) => g.kind === "habit" && g.cadence === "daily" && !touchedToday.has(g.id))
    .map((g) => `"${g.title}"`)
    .sort();
  let line = `\nTended today: ${tended.length ? tended.join(", ") : "nothing"}.`;
  if (untendedDaily.length) line += ` Daily habits not touched today: ${untendedDaily.join(", ")}.`;
  return line;
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
    // If a band is connected, pull today's data BEFORE reading the window, so
    // new readings fold into the window — and thus into the content signature,
    // regenerating the brief exactly once. The sync is lazy and per-day cached:
    // a day already stored is not re-fetched, so a plain reopen writes nothing,
    // the window is byte-identical, and the brief stays frozen. Best-effort —
    // a sync failure must never break the brief (recovery degrades to absent).
    const syncStatus = await syncHealth(supabase, user.id, {
      today: localDay,
      tzOffsetMin,
      lookbackDays: 2,
    }).catch(() => "error" as const);

    // Compute the current inputs (and their signature) first — these are the
    // same inputs the brief is generated from.
    const win = await loadWindow(supabase, user.id);
    const patterns = detectPatterns(
      win.physical,
      win.checkins,
      win.touches,
      win.goals,
    );
    // The previous letter in the correspondence: yesterday evening's for a
    // morning brief, this morning's for an evening brief. Frozen text by the
    // time it's read here, so the line it contributes is stable.
    const { data: prevLetter } = await supabase
      .from("briefs")
      .select("headline, moves")
      .eq("user_id", user.id)
      .eq("day", slot === "morning" ? prevDayISO(day) : day)
      .eq("slot", slot === "morning" ? "evening" : "morning")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // The summary the model reads = the factual window + up to three appended
    // fact lines, each deterministic, each therefore part of the signature:
    //   1. a revoked band grant (otherwise it dies silently in Settings — the
    //      brief may note it once, calmly; transient sync errors never appear),
    //   2. the previous letter and what it pointed at (the correspondence),
    //   3. evening only: what today's tending actually came to (the loop).
    const baseSummary = windowSummary(win.physical, win.checkins, win.goals, win.touches, day);
    const summary =
      baseSummary +
      (syncStatus === "needs_reconnect"
        ? "\nTheir band has lost its connection and needs reconnecting (a quiet Settings action); its readings are paused until then."
        : "") +
      letterLine(slot, prevLetter) +
      (slot === "evening" ? tendedTodayLine(win, day) : "");
    const signature = inputSignature(slot, summary, patterns);
    const tend = tendList(win.goals, win.touches);

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
          tend,
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

    // UPSERT, not insert. briefs has a unique constraint on (user_id, day, slot)
    // — one brief per slot per day. A plain insert succeeds the first time and
    // then fails the duplicate-key check on every regeneration, so a changed
    // signature could never overwrite the stored brief and the slot was stuck
    // regenerating forever. Upserting lets a real input change persist its new
    // brief once, after which the signature matches and it freezes again.
    const storedEvidence: StoredEvidence = { patterns: evidence, sig: signature };
    const { error: upsertError } = await supabase.from("briefs").upsert(
      {
        user_id: user.id,
        day,
        slot,
        headline: brief.headline,
        body: brief.body,
        moves: brief.moves,
        evidence: storedEvidence,
      },
      { onConflict: "user_id,day,slot" },
    );
    if (upsertError) console.error("brief upsert failed:", upsertError.message);

    return NextResponse.json({
      headline: brief.headline,
      body: brief.body,
      moves: brief.moves,
      evidence,
      tend,
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
