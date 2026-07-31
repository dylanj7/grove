"use server";

import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { isDomain, type Domain } from "@/lib/goal-kind";
import { DAY_START_COOKIE } from "@/lib/slot";
import { WELCOMED_COOKIE, WELCOMED_MAX_AGE } from "@/lib/onboarding";

export type WelcomeInput = {
  displayName: string;
  /** What they're moving toward — becomes a vector. Optional. */
  vector: { title: string; domain: Domain } | null;
  /** What's been sitting untended — becomes a rhythm. Optional. */
  rhythm: { title: string; domain: Domain } | null;
  /** Local hour their day actually starts. Optional. */
  dayStartsHour: number | null;
};

export type WelcomeResult = { ok: true } | { ok: false; error: string };

function cleanTitle(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 200);
}

// ============================================================================
// The end of setup, as ONE write.
//
// Everything the four questions produced lands together: the profile, the
// vector, the rhythm, and the two cookies that keep this screen from ever
// appearing again. One call, because the next thing that happens is the capture
// sheet opening — and a person who has just answered four questions should not
// then watch three spinners.
//
// EVERY ANSWER IS OPTIONAL AND EVERY ONE OF THEM DOES SOMETHING. Those two
// facts have to hold together. Optional, because a setup that can't be escaped
// is a wall in front of an app whose whole first principle is not putting walls
// in front of people (see the check-in gate that Home no longer has). And
// consequential, because a question whose answer is discarded is the app
// pretending to listen on the first screen where it asks for anything —
// unaffordable in a product that sells not saying untrue things.
// ============================================================================
export async function completeWelcome(input: WelcomeInput): Promise<WelcomeResult> {
  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) return { ok: false, error: "You've been signed out. Sign in and try again." };

  const displayName = cleanTitle(input.displayName) || null;

  const hour =
    input.dayStartsHour != null &&
    Number.isInteger(input.dayStartsHour) &&
    input.dayStartsHour >= 3 &&
    input.dayStartsHour <= 12
      ? input.dayStartsHour
      : null;

  const planted: {
    user_id: string;
    title: string;
    aspect: Domain;
    kind: "goal" | "habit";
    horizon: "short" | "long";
    cadence: "daily" | null;
    progress: null;
    status: string;
  }[] = [];

  const vectorTitle = input.vector ? cleanTitle(input.vector.title) : "";
  if (vectorTitle && input.vector && isDomain(input.vector.domain)) {
    planted.push({
      user_id: uid,
      title: vectorTitle,
      aspect: input.vector.domain,
      kind: "goal",
      horizon: "long",
      cadence: null,
      progress: null,
      status: "active",
    });
  }

  const rhythmTitle = input.rhythm ? cleanTitle(input.rhythm.title) : "";
  if (rhythmTitle && input.rhythm && isDomain(input.rhythm.domain)) {
    planted.push({
      user_id: uid,
      title: rhythmTitle,
      aspect: input.rhythm.domain,
      kind: "habit",
      // Matches createGoal: a rhythm is ongoing, so the horizon is a neutral
      // 'long' that is never shown, and the daily cadence is what lets the
      // detectors notice it going quiet.
      horizon: "long",
      cadence: "daily",
      progress: null,
      status: "active",
    });
  }

  const [profileRes, goalsRes] = await Promise.all([
    supabase.from("profiles").upsert(
      {
        id: uid,
        display_name: displayName,
        day_starts_hour: hour,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    ),
    planted.length ? supabase.from("goals").insert(planted) : Promise.resolve({ error: null }),
  ]);

  if (profileRes.error) {
    console.error("welcome profile write failed:", profileRes.error.message);
    return { ok: false, error: "Couldn't save that just now. Try again." };
  }
  if (goalsRes.error) {
    // The profile is written, so setup is genuinely over; only the planting
    // failed. Say exactly that rather than sending them back through four
    // questions they already answered.
    console.error("welcome goals write failed:", goalsRes.error.message);
    return {
      ok: false,
      error: "You're set up, but those didn't plant. You can add them from You → Intentions.",
    };
  }

  const jar = await cookies();
  // The gate, carried on the client so the root redirect doesn't have to read
  // the profile on every sign-in. The column is still the durable truth — this
  // is only what keeps it off the hot path.
  jar.set(WELCOMED_COOKIE, "1", { path: "/", maxAge: WELCOMED_MAX_AGE, sameSite: "lax" });
  if (hour != null) {
    jar.set(DAY_START_COOKIE, String(hour), {
      path: "/",
      maxAge: WELCOMED_MAX_AGE,
      sameSite: "lax",
    });
  }

  return { ok: true };
}
