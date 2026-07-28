"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isValidDay } from "@/lib/date";
import { isSlot, type Slot } from "@/lib/slot";
import { hasAnyMetric, hoursToMinutes, type PhysicalMetrics } from "@/lib/physical";

export type CaptureInput = {
  day: string;
  slot: Slot;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  note: string | null;
  /** Hours slept / RHR / HRV / efficiency, as typed. Optional and rare — the
   *  band covers these for most users, and the sheet only asks for what's
   *  genuinely missing. */
  body: {
    sleepHours: number | null;
    restingHr: number | null;
    hrvMs: number | null;
    efficiency: number | null;
  } | null;
};

export type CaptureResult = { ok: true } | { ok: false; error: string };

const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;
const scale = (n: number | null) =>
  n != null && Number.isInteger(n) && inRange(n, 1, 5) ? n : null;

// THE SINGLE WRITE PATH.
//
// This replaced a three-step client dance (load check-in → load band → load
// manual reading, then save body, then save check-in — five round-trips with a
// spinner in front of them). Capture is now one call: the check-in and the
// optional body row are written in PARALLEL, and the sheet doesn't wait on
// either to close, because it has already shown the user their own words back.
//
// Everything is optional. A capture with nothing but a note is valid and useful
// — that is the whole point of removing the form. The scales default to unset
// rather than to 3, so "I didn't say" and "I said the middle" stay different
// facts; patterns.ts already treats null as absent.
export async function capture(input: CaptureInput): Promise<CaptureResult> {
  if (!isValidDay(input.day) || !isSlot(input.slot)) {
    return { ok: false, error: "Something's off with today. Try again." };
  }

  const uid = await getUserId();
  if (!uid) {
    return { ok: false, error: "You've been signed out. Sign in and try again." };
  }

  const note = input.note?.trim() || null;
  if (note && note.length > 4000) {
    return { ok: false, error: "That's a long one — trim it a little and try again." };
  }

  const mood = scale(input.mood);
  const energy = scale(input.energy);
  const focus = scale(input.focus);

  // A capture with nothing in it at all is a no-op, not an error — the user
  // opened the sheet and changed their mind.
  if (!note && mood == null && energy == null && focus == null && !input.body) {
    return { ok: true };
  }

  const supabase = await createClient();

  // The optional hand-entered body, validated the way the old form validated it.
  let metrics: PhysicalMetrics | null = null;
  if (input.body) {
    const { sleepHours, restingHr, hrvMs, efficiency } = input.body;
    if (sleepHours != null && !inRange(sleepHours, 0, 24)) {
      return { ok: false, error: "Hours slept should be between 0 and 24." };
    }
    if (restingHr != null && !inRange(restingHr, 25, 220)) {
      return { ok: false, error: "That resting heart rate looks off — check it?" };
    }
    if (hrvMs != null && !inRange(hrvMs, 0, 400)) {
      return { ok: false, error: "That HRV looks off — check it?" };
    }
    if (efficiency != null && !inRange(efficiency, 0, 100)) {
      return { ok: false, error: "Sleep efficiency is a percent — 0 to 100." };
    }
    const m: PhysicalMetrics = {
      sleep_minutes: hoursToMinutes(sleepHours),
      sleep_efficiency: efficiency != null ? Math.round(efficiency) : null,
      resting_hr: restingHr != null ? Math.round(restingHr) : null,
      hrv_ms: hrvMs != null ? Math.round(hrvMs) : null,
    };
    if (hasAnyMetric(m)) metrics = m;
  }

  // Both writes fire together. Neither depends on the other's result.
  const [checkinRes, physicalRes] = await Promise.all([
    supabase.from("checkins").upsert(
      {
        user_id: uid,
        day: input.day,
        slot: input.slot,
        mood,
        energy,
        focus,
        note_text: note,
      },
      { onConflict: "user_id,day,slot" },
    ),
    metrics
      ? supabase.from("physical_days").upsert(
          {
            user_id: uid,
            day: input.day,
            ...metrics,
            source: "manual",
            // Cleared so the next read recomputes it from these inputs.
            recovery_score: null,
          },
          { onConflict: "user_id,day,source" },
        )
      : Promise.resolve({ error: null }),
  ]);

  if (checkinRes.error) {
    return {
      ok: false,
      error: "Couldn't set this down just now. Your words are safe — try again.",
    };
  }
  if (physicalRes.error) {
    return {
      ok: false,
      error: "The words landed, but the body numbers didn't. Try those again.",
    };
  }

  // The next read detects the change via its input signature and regenerates the
  // letter lazily — no eager invalidation, no model call on the write path.
  revalidatePath("/home");
  revalidatePath("/rhythm");
  return { ok: true };
}
