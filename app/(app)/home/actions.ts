"use server";

import { createClient, getUserId } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";
import type { ActionResult } from "@/app/(app)/goals/actions";

// Acting on one of the letter's intentions.
//
// Deliberately NO revalidatePath. The row is optimistic and stays that way: the
// tap is the truth, the write goes out in a transition, and only a failure
// moves the UI back (components/intentions.tsx). A revalidate here would
// hand back a re-rendered payload for state the client already has, and on the
// one screen where an LLM sits behind a Suspense boundary it would put the
// letter's resolution back on the critical path of a checkbox.
//
// There is no existence check against the brief either, for the same reason:
// it would buy a round-trip on every tap to prevent a person from writing a
// move into their own record that their own letter didn't ask for. RLS scopes
// every row to its owner, which is the boundary that actually matters.

const STATES = new Set(["tended", "let_go"]);

export async function setMoveState(input: {
  day: string;
  slot: "morning" | "evening";
  moveKey: string;
  moveText: string;
  aspect: string;
  state: "tended" | "let_go";
}): Promise<ActionResult> {
  if (!isValidDay(input.day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }
  if (input.slot !== "morning" && input.slot !== "evening") {
    return { ok: false, error: "Couldn't place that intention. Try again." };
  }
  if (!STATES.has(input.state)) {
    return { ok: false, error: "Couldn't place that intention. Try again." };
  }
  const text = input.moveText.trim().slice(0, 400);
  if (!text || !input.moveKey) {
    return { ok: false, error: "Couldn't place that intention. Try again." };
  }

  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) return { ok: false, error: "You've been signed out. Sign in and try again." };

  // Upsert, not insert: tapping a row twice must toggle one row, not accumulate
  // a log of taps. A tend is current state; a history of taps is a tally, and a
  // tally is the thing this app doesn't keep.
  const { error } = await supabase.from("move_tends").upsert(
    {
      user_id: uid,
      day: input.day,
      slot: input.slot,
      move_key: input.moveKey,
      move_text: text,
      aspect: input.aspect,
      state: input.state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,day,slot,move_key" },
  );

  if (error) return { ok: false, error: "Couldn't mark it just now. Try again." };
  return { ok: true };
}

/** Put an intention back to open — the undo for both tending and letting go. */
export async function clearMoveState(input: {
  day: string;
  slot: "morning" | "evening";
  moveKey: string;
}): Promise<ActionResult> {
  if (!isValidDay(input.day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }

  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) return { ok: false, error: "You've been signed out. Sign in and try again." };

  const { error } = await supabase
    .from("move_tends")
    .delete()
    .eq("user_id", uid)
    .eq("day", input.day)
    .eq("slot", input.slot)
    .eq("move_key", input.moveKey);

  if (error) return { ok: false, error: "Couldn't update it just now. Try again." };
  return { ok: true };
}
