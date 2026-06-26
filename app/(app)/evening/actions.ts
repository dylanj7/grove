"use server";

import { createClient } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";

export type CheckinValues = {
  mood: number;
  energy: number;
  focus: number;
  note_text: string | null;
};

export type SaveResult = { ok: true } | { ok: false; error: string };

// Read today's check-in (by the user's local day) so the screen knows whether
// to invite or to show what's recorded.
export async function getCheckin(day: string): Promise<CheckinValues | null> {
  if (!isValidDay(day)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("checkins")
    .select("mood, energy, focus, note_text")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  return data ?? null;
}

// The single write path. Upserts on (user_id, day) so re-entering the same day
// edits rather than duplicates. The day is the user's local date.
export async function saveCheckin(
  day: string,
  input: CheckinValues,
): Promise<SaveResult> {
  if (!isValidDay(day)) {
    return { ok: false, error: "Something's off with today's date. Try again." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "You've been signed out. Sign in and try again." };
  }

  const { error } = await supabase.from("checkins").upsert(
    {
      user_id: user.id,
      day,
      mood: input.mood,
      energy: input.energy,
      focus: input.focus,
      note_text: input.note_text,
    },
    { onConflict: "user_id,day" },
  );

  if (error) {
    return {
      ok: false,
      error: "Couldn't set this down just now. Your words are safe — try again.",
    };
  }
  return { ok: true };
}
