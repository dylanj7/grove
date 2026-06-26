"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";
import { toDbKind, isDomain, type UiKind, type Domain } from "@/lib/goal-kind";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Plant a new intention. A habit is stored with kind 'habit' + daily cadence
// (so the detector can notice neglect); a goal (vector) is stored as a
// 'milestone' with a horizon. Habits get a neutral 'long' horizon — they're
// ongoing by nature, so it's not shown or used for them.
export async function createGoal(input: {
  title: string;
  kind: UiKind;
  domain: Domain;
  horizon?: "short" | "long";
}): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a few words first." };
  if (title.length > 200) return { ok: false, error: "Keep it short — a phrase, not a paragraph." };
  if (!isDomain(input.domain)) return { ok: false, error: "Pick a domain." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You've been signed out. Sign in and try again." };

  const isHabit = input.kind === "habit";
  const { error } = await supabase.from("goals").insert({
    user_id: user.id,
    title,
    aspect: input.domain,
    kind: toDbKind(input.kind),
    horizon: isHabit ? "long" : input.horizon ?? "long",
    cadence: isHabit ? "daily" : null,
    progress: null,
    status: "active",
  });

  if (error) return { ok: false, error: "Couldn't plant that just now. Try again." };

  revalidatePath("/goals");
  return { ok: true };
}

// Tend an intention — a small, real, honest act. Writes one goal_touches row
// (an "I tended this" moment) with an optional note, keyed to the local day.
export async function tendGoal(input: {
  goalId: string;
  day: string;
  note: string | null;
}): Promise<ActionResult> {
  if (!isValidDay(input.day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You've been signed out. Sign in and try again." };

  // Confirm the intention is the user's before tending it.
  const { data: goal } = await supabase
    .from("goals")
    .select("id")
    .eq("id", input.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return { ok: false, error: "That intention couldn't be found." };

  const { error } = await supabase.from("goal_touches").insert({
    user_id: user.id,
    goal_id: input.goalId,
    day: input.day,
    note: input.note,
  });

  if (error) {
    return { ok: false, error: "Couldn't set this down just now. Your words are safe — try again." };
  }

  revalidatePath(`/goals/${input.goalId}`);
  revalidatePath("/goals");
  return { ok: true };
}
