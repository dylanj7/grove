// POST /api/health/sync — the fire-and-forget band pull.
//
// The old check-in screen force-synced the band BEFORE it would render its form:
// you tapped "Check in" and waited on a network round-trip to Google before you
// could type a word. The reason behind it was sound, though — a day's band row
// accrues all day (steps through the evening; the night's sleep and daily
// HR/HRV landing the next morning), and the lazy per-day cache would otherwise
// freeze today at whatever partial state it was first written in, so a
// first-evening steps-only row would mean sleep never landing for the morning
// after. A deliberate capture is a real need and still deserves a forced fetch.
//
// So it kept the fetch and dropped the wait: the capture sheet calls this
// afterwards without awaiting it. Nothing in the UI is downstream of the
// result — the next screen read picks up whatever landed.
import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { syncHealth } from "@/lib/health";
import { isValidDay, todayISO } from "@/lib/date";

export async function POST(request: Request) {
  const uid = await getUserId();
  if (!uid) return new NextResponse(null, { status: 401 });

  const params = new URL(request.url).searchParams;
  const day = (() => {
    const d = params.get("day");
    return d && isValidDay(d) ? d : todayISO();
  })();
  const tzOffsetMin = (() => {
    const n = Number(params.get("tz"));
    return Number.isInteger(n) && Math.abs(n) <= 840 ? n : 0;
  })();

  try {
    const supabase = await createClient();
    await syncHealth(supabase, uid, {
      today: day,
      tzOffsetMin,
      lookbackDays: 1,
      force: true,
    });
  } catch {
    // No band, a revoked grant, or Google having a bad minute. All normal
    // outcomes for a background pull nobody is waiting on.
  }

  return new NextResponse(null, { status: 204 });
}
