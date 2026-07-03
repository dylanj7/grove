// POST /api/health/refresh (PHASE5 §5: "a manual refresh" is a real-need fetch).
// Forces a re-pull of the recent window — the escape hatch from the otherwise
// lazy, per-day-cached sync (so a user can pull today's data again on demand).
// Keyed to the server's UTC day; the daily brief sync handles local-date nuance.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncHealth } from "@/lib/health";
import { todayISO } from "@/lib/date";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`, { status: 303 });
  }

  // TEMPORARY: syncHealth returns a status string (it doesn't normally throw),
  // but the .catch used to swallow any real exception into an opaque "error".
  // Log both the thrown error AND the returned status so we can see which branch
  // produced "error" (a caught throw, a "disconnected"/"error" return, etc.).
  const status = await syncHealth(supabase, user.id, {
    today: todayISO(),
    lookbackDays: 13,
    force: true,
  }).catch((e) => {
    console.error("[health refresh ERROR]", e);
    return "error" as const;
  });
  console.error("[health refresh] status =", status);

  const back =
    status === "needs_reconnect"
      ? "reconnect"
      : status === "synced"
        ? "refreshed"
        : status === "skipped"
          ? "refreshed"
          : "error";
  return NextResponse.redirect(`${origin}/history?health=${back}`, { status: 303 });
}
