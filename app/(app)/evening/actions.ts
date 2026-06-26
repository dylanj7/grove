"use server";

import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/date";

export type SaveResult = { ok: true } | { ok: false; error: string };

// The one write in Phase 2. Upserts today's check-in on (user_id, day), so
// re-entering edits today's rather than duplicating. The day is computed
// server-side, not trusted from the client.
export async function saveCheckin(input: {
  mood: number;
  energy: number;
  focus: number;
  note: string | null;
}): Promise<SaveResult> {
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
      day: todayISO(),
      mood: input.mood,
      energy: input.energy,
      focus: input.focus,
      note_text: input.note,
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
