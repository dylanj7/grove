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

  const status = await syncHealth(supabase, user.id, {
    today: todayISO(),
    lookbackDays: 13,
    force: true,
  }).catch(() => "error" as const);

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
