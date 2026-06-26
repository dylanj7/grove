import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "./date";

// A fresh check-in (or tend) must never be invisible to the next brief. The
// brief is cached per (user, day, slot); clearing today's cached brief on any
// write that changes the window forces the next read to regenerate with the
// new material present.
export async function invalidateTodayBriefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from("briefs")
    .delete()
    .eq("user_id", userId)
    .eq("day", todayISO());
}
