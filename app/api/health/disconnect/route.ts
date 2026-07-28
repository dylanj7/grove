// POST /api/health/disconnect (PHASE5 §6). An honest Settings action: drop the
// token row and the band-sourced readings, falling cleanly back to manual input.
// 303 so the form POST lands on a GET of Settings.

import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { disconnect } from "@/lib/health";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) {
    return NextResponse.redirect(`${origin}/login`, { status: 303 });
  }

  const { ok } = await disconnect(supabase, uid);
  return NextResponse.redirect(
    `${origin}/you?health=${ok ? "disconnected" : "error"}`,
    { status: 303 },
  );
}
