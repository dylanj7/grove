// GET /api/health/connect — Leg 1 of the Google OAuth flow (PHASE5 §3).
// Mints CSRF state (persisted server-side, keyed to the user), then redirects
// the signed-in user to Google's consent screen. The seam owns the URL details.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { beginConnect, googleConfigured } from "@/lib/health";

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // No Google credentials in this environment (e.g. local dev): don't pretend.
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/history?health=unconfigured`);
  }

  try {
    const url = await beginConnect(supabase, user.id);
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.redirect(`${origin}/history?health=error`);
  }
}
