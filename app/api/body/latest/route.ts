import { NextResponse } from "next/server";
import { createClient, getUserId } from "@/lib/supabase/server";
import { minutesToHours } from "@/lib/physical";

// The most recent night the app already knows about.
//
// It exists for one interaction: the capture sheet's "Add last night's body".
// That control used to open four empty inputs and ask a person to type numbers
// their band had already synced — the app asking for data it was holding.
//
// WHY A ROUTE AND NOT A PROP. The obvious alternative is to read this in the
// app shell and pass it down, but the shell renders on EVERY navigation, and
// this would put a query on the critical path of every screen to serve a
// disclosure most people never open. WHY NOT ON SHEET OPEN: the sheet is
// deliberately a zero-round-trip object — it opens instantly from anywhere.
// So it is fetched at the only moment it is actually wanted: when the
// disclosure is expanded.
export async function GET(request: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ reading: null }, { status: 401 });

  const url = new URL(request.url);
  const day = url.searchParams.get("day");
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ reading: null }, { status: 400 });
  }

  const supabase = await createClient();

  // A window back from the capture's day, newest first. Two days wide because a
  // band writes the night's sleep whenever it next syncs, which is often the
  // following morning — and because "last night" for someone capturing at 1am
  // is a different date than the one they'd name.
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - 2 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from("physical_days")
    .select("day, source, sleep_minutes, sleep_efficiency, resting_hr, hrv_ms")
    .eq("user_id", uid)
    .gte("day", since)
    .lte("day", day)
    .order("day", { ascending: false })
    // Provider before manual, so the band's reading is the one that answers.
    .order("source", { ascending: false });

  if (error) return NextResponse.json({ reading: null }, { status: 200 });

  // The newest row that carries an actual night in it. A same-day partial (a
  // band writes steps all day; the night lands later) must not shadow a real
  // reading — the same rule latestBody() follows in lib/read.ts.
  const row = (data ?? []).find(
    (d) =>
      d.sleep_minutes != null ||
      d.sleep_efficiency != null ||
      d.resting_hr != null ||
      d.hrv_ms != null,
  );

  if (!row) return NextResponse.json({ reading: null });

  return NextResponse.json({
    reading: {
      day: row.day,
      fromBand: row.source !== "manual",
      sleepHours: minutesToHours(row.sleep_minutes),
      efficiency: row.sleep_efficiency,
      restingHr: row.resting_hr,
      hrvMs: row.hrv_ms,
    },
  });
}
