// GET /api/health/callback — Leg 2 (PHASE5 §3). The exact route registered as
// GOOGLE_HEALTH_REDIRECT_URI. Google sends the user back here after consent.
//
// The user still carries their Grove session cookie (this is a top-level
// navigation back to Grove's own origin), so getUser() identifies them and the
// seam verifies the CSRF state, exchanges the code, and stores tokens. Every
// failure returns calmly to Settings — never a broken screen (PHASE5 §6).

import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { completeConnect, syncHealth } from "@/lib/health";
import { todayISO } from "@/lib/date";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) return NextResponse.redirect(`${origin}/login`);

  const settings = (status: string) =>
    NextResponse.redirect(`${origin}/you?health=${status}`);

  // The user cancelled, or Google blocked the grant. access_denied is a calm
  // cancel; anything else (commonly "access blocked / app not verified" when the
  // account isn't on the OAuth test-user list for these Restricted scopes) gets
  // the honest "blocked" message in Settings.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return settings(oauthError === "access_denied" ? "denied" : "blocked");
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return settings("error");

  const result = await completeConnect(supabase, uid, code, state);
  if (!result.ok) return settings("error");

  // Backfill the recent window so the body isn't empty on return — best-effort,
  // and forced (this is a genuine "real need" fetch). Never block the redirect
  // on it; a sync hiccup must not strand the user on a blank screen.
  await syncHealth(supabase, uid, {
    today: todayISO(),
    lookbackDays: 13,
    force: true,
  }).catch(() => {});

  return settings("connected");
}
