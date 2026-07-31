// lib/brief-read.ts
// ----------------------------------------------------------------
// The brief READ, factored out of app/api/brief/route.ts so it can run in two
// places with identical behavior:
//   • the /today Server Component, on first paint (no client fetch, no flash);
//   • the /api/brief route, which wraps this with a health sync + HTTP shell.
//
// Content-addressed exactly as before: a brief is a pure function of its inputs,
// cached on a signature of those inputs. Same (user_id, day, slot) inputs → same
// signature → the stored brief is served untouched. A real change regenerates it
// once, then it freezes again.
//
// This function does NOT sync the band. Freshness is the caller's job: the route
// syncs before calling; the page revalidates AFTER first paint (so a network
// sync never stalls the render). The band's needs_reconnect note is derived from
// connectionState — a cheap token read, not a data sync — so the signature this
// computes matches the route's byte-for-byte on the common path.
// ----------------------------------------------------------------

import { cache } from "react";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { loadWindow, type WindowData } from "@/lib/window";
import { detectPatterns, windowSummary, type Pattern } from "@/lib/patterns";
import { generateBrief } from "@/lib/brief";
import { connectionState, googleConfigured, type ConnectionState } from "@/lib/health";
import { todayISO } from "@/lib/date";
import type { Slot } from "@/lib/slot";
import {
  carriedForward,
  dayStartUTC,
  intentionFacts,
  resolveIntentions,
  statesFor,
  type Intention,
  type MoveTend,
} from "@/lib/intentions";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Move = { aspect: string; text: string };
export type TendHabit = { id: string; title: string; aspect: string; recentDays: string[] };
export type TendGoal = { id: string; title: string; aspect: string };
export type Tend = { habits: TendHabit[]; goals: TendGoal[] };

export type BriefContent = {
  headline: string;
  body: string;
  moves: Move[];
  tend: Tend;
  evidence: Pattern[];
  cached: boolean;
};

// The "did anything real change?" detector: a fingerprint of exactly what
// generateBrief consumes. Same inputs → same signature → same brief, untouched.
// Patterns are sorted by code first so the fingerprint can't depend on the order
// the detector happened to emit them — only on WHICH patterns are present and
// what they say.
function inputSignature(slot: Slot, summary: string, patterns: Pattern[]): string {
  const sorted = [...patterns].sort((a, b) => a.code.localeCompare(b.code));
  const canonical = JSON.stringify({ slot, summary, patterns: sorted });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// The deterministic "what to tend today" reminders — a plain read of the user's
// current goals and habits, never the model. A deterministic list cannot
// regenerate differently, so it is frozen by construction (Phase 4.5 §3a).
function tendList(goals: WindowData["goals"], touches: WindowData["touches"]): Tend {
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

export function readStored(evidence: unknown): { patterns: Pattern[]; sig?: string } {
  // New format is { patterns, sig }; legacy rows stored a bare Pattern[].
  if (Array.isArray(evidence)) return { patterns: evidence as Pattern[] };
  const e = (evidence ?? {}) as StoredEvidence;
  return { patterns: e.patterns ?? [], sig: e.sig };
}

// Everything the brief READ produces: the content signature, the stored brief
// (if any) to compare it against, the deterministic tend list, and the raw
// materials generation needs on a miss. Plus hasCheckin — derived FROM the same
// window, so /today's "is this slot checked in?" gate costs no extra query.
export type BriefInputs = {
  slot: Slot;
  day: string;
  localDay: string;
  hasCheckin: boolean;
  signature: string;
  tend: Tend;
  patterns: Pattern[];
  summary: string;
  /** The raw window these inputs were derived from. Carried out so the screen
   *  can render the body strip and the deterministic read (lib/read.ts) from
   *  the SAME round-trip that fed the brief — never a second set of queries. */
  win: WindowData;
  /** Every act on a letter's intentions for this day and the one before it. */
  moveTends: MoveTend[];
  /** The other half of the correspondence: the letter this one answers. */
  prevLetter: { day: string; slot: Slot; moves: Move[] } | null;
  existing: {
    headline: string;
    body: string;
    moves: unknown;
    evidence: unknown;
  } | null;
};

/** The moves of a stored brief, whatever shape the row happens to hold. */
function storedMoves(moves: unknown): Move[] {
  if (!Array.isArray(moves)) return [];
  return moves.flatMap((m) => {
    const move = m as { aspect?: string; text?: string };
    return move?.text ? [{ aspect: move.aspect ?? "mental", text: move.text }] : [];
  });
}

/**
 * The intentions still open from the previous letter, as the UI should show
 * them: LIVE state, no cutoff.
 *
 * This is deliberately a different computation from the one that feeds the
 * summary (see carriedForward's `resolvedBefore`). The summary must be frozen
 * at the day boundary or tending a carried-forward intention re-signs the brief
 * and buys a replacement letter mid-morning; the screen must be live or tapping
 * a row wouldn't visibly resolve it. Same facts, two different obligations.
 */
export function carriedForUi(inputs: BriefInputs): Intention[] {
  if (!inputs.prevLetter) return [];
  return carriedForward({
    prevMoves: inputs.prevLetter.moves,
    tends: inputs.moveTends,
    prevDay: inputs.prevLetter.day,
    prevSlot: inputs.prevLetter.slot,
  });
}

/** This letter's own moves, resolved against what's been done with them. */
export function intentionsFor(inputs: BriefInputs, moves: Move[]): Intention[] {
  return resolveIntentions(moves, statesFor(inputs.moveTends, inputs.day, inputs.slot));
}

// The brief READ, collapsed to ONE parallel round-trip. loadWindow, the previous
// letter, the connection state, and the stored brief are mutually independent —
// so they fire together, not in series. Pure: reads only, never generates or
// writes, so it is safe to run before the check-in gate (its results are simply
// discarded on the needs-checkin path). The brief key day stays UTC (its stable
// identity); only the slot is the user's local slot.
//
// connectionState is read here (NOT cached): syncHealth mutates needs_reconnect
// mid-request, and the route runs syncHealth immediately before this — so this
// must see the post-sync flag, which a per-request cache would hide.
export async function loadBriefInputs(
  supabase: Supabase,
  userId: string,
  slot: Slot,
  localDay: string,
): Promise<BriefInputs> {
  const day = todayISO();
  const prevDay = prevDayISO(day);
  const prevSlot: Slot = slot === "morning" ? "evening" : "morning";
  const prevLetterDay = slot === "morning" ? prevDay : day;

  const [win, prevRes, connState, existingRes, tendsRes] = await Promise.all([
    loadWindow(supabase, userId),
    // The previous letter in the correspondence: yesterday evening's for a
    // morning brief, this morning's for an evening brief. Frozen text by now.
    supabase
      .from("briefs")
      .select("headline, moves")
      .eq("user_id", userId)
      .eq("day", prevLetterDay)
      .eq("slot", prevSlot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A revoked band grant, noted once, calmly — derived from the token flag, not
    // a live sync, so the page and the route compute the same signature.
    googleConfigured()
      ? connectionState(supabase, userId)
      : Promise.resolve<ConnectionState>("disconnected"),
    // Cache-first: the newest brief for this exact triple, to compare signatures.
    supabase
      .from("briefs")
      .select("headline, body, moves, evidence")
      .eq("user_id", userId)
      .eq("day", day)
      .eq("slot", slot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // What's been done with the letters' intentions — this letter's and the one
    // it answers. Two days is the whole span the correspondence reaches, so this
    // stays a couple of rows and joins the same parallel round-trip rather than
    // adding a query to the screen's critical path.
    supabase
      .from("move_tends")
      .select("day, slot, move_key, move_text, aspect, state, created_at")
      .eq("user_id", userId)
      .in("day", [day, prevDay])
      .order("day", { ascending: false })
      .order("move_key", { ascending: true }),
  ]);

  // The check-in gate, read straight off the window (check-ins are keyed to the
  // user's local day) — no separate point-read.
  const hasCheckin = win.checkins.some((c) => c.day === localDay && c.slot === slot);

  const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals);
  const needsReconnect = connState === "needs_reconnect";
  const baseSummary = windowSummary(win.physical, win.checkins, win.goals, win.touches, day);

  const moveTends = (tendsRes.data ?? []) as MoveTend[];
  const prevMoves = storedMoves(prevRes.data?.moves);
  const prevLetter = prevRes.data ? { day: prevLetterDay, slot: prevSlot, moves: prevMoves } : null;

  // The intention facts, and the ONE place their two obligations diverge.
  //
  // EVENING sees this morning's intentions live, because closing the morning's
  // loop honestly is the evening letter's whole job — and its summary already
  // moves with the day's tending (tendedTodayLine, above), so this adds no new
  // regeneration behavior.
  //
  // MORNING sees yesterday evening's intentions frozen at midnight UTC. Without
  // that cutoff, tending a carried-forward intention at 9am would change this
  // summary, change the signature, and replace the letter already on the screen
  // with a freshly-paid-for one — the same failure mode that made step drift
  // regenerate briefs until patterns.ts started quantizing it.
  const sameDayMoves =
    slot === "evening" && prevMoves.length
      ? resolveIntentions(prevMoves, statesFor(moveTends, prevLetterDay, prevSlot))
      : undefined;
  const carried =
    slot === "morning" && prevMoves.length
      ? carriedForward({
          prevMoves,
          tends: moveTends,
          prevDay: prevLetterDay,
          prevSlot,
          resolvedBefore: dayStartUTC(day),
        })
      : [];

  const summary =
    baseSummary +
    (needsReconnect
      ? "\nTheir band has lost its connection and needs reconnecting (a quiet Settings action); its readings are paused until then."
      : "") +
    letterLine(slot, prevRes.data) +
    intentionFacts({ slot, sameDayMoves, carried }) +
    (slot === "evening" ? tendedTodayLine(win, day) : "");

  return {
    slot,
    day,
    localDay,
    hasCheckin,
    signature: inputSignature(slot, summary, patterns),
    tend: tendList(win.goals, win.touches),
    patterns,
    summary,
    win,
    moveTends,
    prevLetter,
    existing: existingRes.data ?? null,
  };
}

// The per-request memo of the read above. The home screen renders its shell and
// its streamed letter as two separate subtrees (so the shell paints instantly
// and the letter arrives behind a Suspense boundary) — but both need the same
// inputs. cache() makes the second caller reuse the first's promise, so the
// whole screen still costs exactly ONE parallel round-trip, not two.
export const loadBriefInputsCached = cache(loadBriefInputs);

// Resolve inputs to a brief: serve the stored one when the signature matches (the
// common path — no Claude call), else generate once and store. This is the ONLY
// part that writes, so it is kept separate from the reads and out of any cache.
export async function resolveBrief(
  supabase: Supabase,
  userId: string,
  inputs: BriefInputs,
): Promise<BriefContent> {
  const { slot, day, signature, tend, patterns, summary, existing } = inputs;

  // Unchanged inputs → serve the same brief, no Claude call. The common path.
  if (existing) {
    const stored = readStored(existing.evidence);
    if (stored.sig === signature) {
      return {
        headline: existing.headline,
        body: existing.body,
        moves: (existing.moves ?? []) as Move[],
        tend,
        evidence: stored.patterns,
        cached: true,
      };
    }
  }

  // Miss or a real change → generate once, store with the new signature.
  const { brief, evidence } = await generateBrief({ slot, patterns, windowSummary: summary });

  // UPSERT, not insert. briefs has a unique constraint on (user_id, day, slot).
  // A plain insert would fail the duplicate-key check on every regeneration, so a
  // changed signature could never overwrite the stored brief. Upserting lets a
  // real input change persist its new brief once, after which the signature
  // matches and it freezes again.
  const storedEvidence: StoredEvidence = { patterns: evidence, sig: signature };
  const { error: upsertError } = await supabase.from("briefs").upsert(
    {
      user_id: userId,
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

  return {
    headline: brief.headline,
    body: brief.body,
    moves: brief.moves,
    tend,
    evidence,
    cached: false,
  };
}

// Read + resolve in one call — the route's convenience path, where a brief is
// always wanted (it's only hit post-paint for an already-checked-in user). The
// /today page instead calls loadBriefInputs, gates on hasCheckin, then
// resolveBrief — so it never generates a brief before the check-in exists. May
// throw; callers degrade.
export async function readBrief(
  supabase: Supabase,
  userId: string,
  slot: Slot,
  localDay: string,
): Promise<BriefContent> {
  const inputs = await loadBriefInputs(supabase, userId, slot, localDay);
  return resolveBrief(supabase, userId, inputs);
}
