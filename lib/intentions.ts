// lib/intentions.ts
// ----------------------------------------------------------------
// THE LOOP'S SECOND HALF.
//
// lib/brief.ts writes the letter and the letter ends in moves. Until Phase 7
// those moves were rendered text: the app asked for two things and then never
// found out whether either happened. That made the whole product a one-way
// loop — capture, letter, silence — with no reason to open Grove between the
// two captures and nothing for the evening letter to close except inference.
//
// A move plus a state is an INTENTION, and an intention is the app's primary
// interactive object. Tending one is the 2pm reason to open Grove; it is what
// gives the evening letter real material instead of a guess; and it is what
// makes a day count as set down for the tree.
//
// Pure and deterministic, like read.ts and patterns.ts: this file resolves
// moves against stored states and produces facts. It never interprets and it
// never scores. There is deliberately no count of tended intentions anywhere in
// here that is not scoped to a single letter — "one of two, today" is a status;
// "eleven this month" is a streak with a haircut.
// ----------------------------------------------------------------

import type { Slot } from "./slot";

export type IntentionState = "open" | "tended" | "let_go";

/** A move from the letter, resolved against what the person has done with it. */
export type Intention = {
  /** Stable identity within its letter. See moveKey. */
  key: string;
  aspect: string;
  text: string;
  state: IntentionState;
};

/** One stored act on a move. Mirrors public.move_tends. */
export type MoveTend = {
  day: string;
  slot: string;
  move_key: string;
  move_text: string;
  aspect: string;
  state: "tended" | "let_go";
  created_at: string;
};

// A move's text as the key sees it: case and spacing and a trailing full stop
// are not identity. Re-punctuating a move must not orphan the tend attached to
// it, and two moves that differ only in whitespace are the same intention.
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?;:,]+$/, "");
}

/**
 * The stable identity of a move within its letter.
 *
 * FNV-1a, not SHA — deliberately. This key is an identity, never a secret and
 * never a signature: it distinguishes at most three moves inside one letter, so
 * 32 bits is enormous headroom, and a non-cryptographic hash keeps this whole
 * module isomorphic. That matters because the row component is a client
 * component and computes keys for its optimistic state; a `node:crypto` import
 * here would drag the server runtime into the bundle to do arithmetic.
 *
 * Keyed on aspect + text so the same sentence filed under body and under work
 * is two intentions, which is what the letter means when it does that.
 */
export function moveKey(aspect: string, text: string): string {
  const input = `${aspect}:${normalize(text)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // The FNV prime, by shifts — Math.imul keeps it in 32-bit space.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Index stored acts by their move key, for one letter. */
export function statesFor(
  tends: MoveTend[],
  day: string,
  slot: Slot,
): Map<string, IntentionState> {
  const out = new Map<string, IntentionState>();
  for (const t of tends) {
    if (t.day === day && t.slot === slot) out.set(t.move_key, t.state);
  }
  return out;
}

/** Resolve a letter's moves against what's been done with them. */
export function resolveIntentions(
  moves: { aspect: string; text: string }[],
  states: Map<string, IntentionState>,
): Intention[] {
  return moves.map((m) => {
    const key = moveKey(m.aspect, m.text);
    return { key, aspect: m.aspect, text: m.text, state: states.get(key) ?? "open" };
  });
}

/**
 * What's still sitting there from the previous letter.
 *
 * An untended intention must not silently vanish at the slot boundary — that is
 * the app quietly agreeing to forget what it asked for, which is how a to-do
 * list teaches you to ignore it. It comes forward instead, named plainly.
 *
 * `resolvedBefore` is what keeps this cheap. For the MORNING letter it is that
 * brief's own day at midnight UTC: a previous move counts as resolved only if
 * it was resolved before this letter's day began. Without that cutoff, tending
 * yesterday's carried-forward intention at 9am would change the window summary,
 * change the content signature, and buy a fresh Opus letter to replace the one
 * already on the screen — the exact failure mode lib/patterns.ts quantizes step
 * counts to avoid. With it, the morning's carry-forward is frozen at midnight
 * and the tend resolves in the UI, where it belongs.
 *
 * The EVENING letter passes no cutoff and sees live state, because the evening
 * letter's whole job is to close the morning's loop honestly — and its summary
 * already moves with the day's tending (see tendedTodayLine in brief-read.ts).
 */
export function carriedForward(args: {
  prevMoves: { aspect: string; text: string }[];
  tends: MoveTend[];
  prevDay: string;
  prevSlot: Slot;
  resolvedBefore?: string;
}): Intention[] {
  const { prevMoves, tends, prevDay, prevSlot, resolvedBefore } = args;
  const cutoff = resolvedBefore ? Date.parse(resolvedBefore) : null;

  const resolved = new Map<string, IntentionState>();
  for (const t of tends) {
    if (t.day !== prevDay || t.slot !== prevSlot) continue;
    if (cutoff !== null && Date.parse(t.created_at) >= cutoff) continue;
    resolved.set(t.move_key, t.state);
  }

  return resolveIntentions(prevMoves, resolved).filter((i) => i.state === "open");
}

/** Midnight UTC at the start of a YYYY-MM-DD, as an ISO instant. */
export function dayStartUTC(day: string): string {
  return `${day}T00:00:00.000Z`;
}

/**
 * The intention facts, for the window summary the letter is given.
 *
 * Plain statements only — this is context, never instruction. The prompt
 * decides what is worth saying; it is forbidden to tally, and there is no
 * number here for it to tally with.
 */
export function intentionFacts(args: {
  slot: Slot;
  /** This letter's counterpart: the morning's moves, when writing the evening. */
  sameDayMoves?: Intention[];
  /** Still open from the previous letter. */
  carried: Intention[];
}): string {
  const { slot, sameDayMoves, carried } = args;
  const lines: string[] = [];

  if (slot === "evening" && sameDayMoves?.length) {
    const tended = sameDayMoves.filter((i) => i.state === "tended").map((i) => `"${i.text}"`);
    const letGo = sameDayMoves.filter((i) => i.state === "let_go").map((i) => `"${i.text}"`);
    const open = sameDayMoves.filter((i) => i.state === "open").map((i) => `"${i.text}"`);
    if (tended.length) lines.push(`Of this morning's intentions, they tended: ${tended.join(", ")}.`);
    if (letGo.length) lines.push(`They deliberately let go: ${letGo.join(", ")}.`);
    if (open.length) lines.push(`Still open from this morning: ${open.join(", ")}.`);
  }

  if (carried.length) {
    const opened =
      slot === "morning" ? "Still sitting there from yesterday evening's letter" : "Still sitting there from earlier";
    lines.push(`${opened}: ${carried.map((i) => `"${i.text}"`).join(", ")}.`);
  }

  return lines.length ? `\n${lines.join(" ")}` : "";
}
