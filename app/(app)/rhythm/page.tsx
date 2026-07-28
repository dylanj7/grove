import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel, Card } from "@/components/ui";
import RhythmChart from "@/components/rhythm-chart";
import { loadWindow } from "@/lib/window";
import { detectPatterns } from "@/lib/patterns";
import { buildRhythm } from "@/lib/rhythm";
import { localDayFromOffset, parseTzOffset, todayISO } from "@/lib/date";

const STRENGTH_LABEL: Record<string, string> = {
  strong: "Clear",
  moderate: "Showing",
  weak: "Faint",
};

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ============================================================================
// RHYTHM — the screen that shows you your own life.
// ----------------------------------------------------------------------------
// This is the biggest thing the app was missing. Grove has been sitting on
// fourteen days of sleep, heart rate, mood, energy and focus for every user and
// rendering exactly none of it — the old "You" tab was a reverse-chronological
// list of headlines and the word "Tended". Every competing product in this
// space, from Oura to a paper journal, lets you look at your own record. Grove
// made you take its word for it.
//
// Three registers, in descending order of certainty:
//   1. THE CHART — your data, unmediated. No interpretation, no model.
//   2. WHAT'S TRUE — the patterns lib/patterns.ts verified in code. Still no
//      model: these are the exact statements the letter is permitted to draw
//      on, shown plainly so the letter can never seem to know more than it does.
//   3. THE LETTERS — the archive, last.
//
// Nothing here is a score, a streak, or a comparison — not even against the
// user's own past. It's a record you can look at.
// ============================================================================
export default async function RhythmPage() {
  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);
  const localDay = offset === null ? todayISO() : localDayFromOffset(offset);

  const supabase = await createClient();
  const uid = (await getUserId())!;

  const [win, { data: briefs }] = await Promise.all([
    loadWindow(supabase, uid),
    supabase
      .from("briefs")
      .select("day, slot, headline, body")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const rhythm = buildRhythm(win, localDay);
  const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals)
    // checkin_state is a restatement of the most recent capture, not a trend —
    // it exists to give the model material, and it would be noise here.
    .filter((p) => p.code !== "checkin_state");

  const letters = briefs ?? [];

  return (
    <Screen className="grove-stagger space-y-10">
      <header className="pt-1">
        <Eyebrow primary="Rhythm" secondary="last 14 days" />
      </header>

      {rhythm.hasAny ? (
        <section>
          <RhythmChart data={rhythm} todayKey={localDay} />
        </section>
      ) : (
        <Card className="space-y-2">
          <Voice className="text-[1.2rem]">Nothing to show yet.</Voice>
          <p className="text-[0.88rem] leading-relaxed text-canopy">
            Set down a line or two and this fills in. A week is usually enough
            for the shape of things to start showing.
          </p>
        </Card>
      )}

      {patterns.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel right="verified in your data">What&rsquo;s true</SectionLabel>
          <ul className="space-y-3">
            {patterns.map((p) => (
              <li key={p.code + p.statement}>
                <Card className="flex gap-3 p-4">
                  <span
                    aria-hidden
                    className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.strength === "strong" ? "bg-ember" : "bg-canopy"
                    }`}
                  />
                  <div className="space-y-1">
                    <p className="text-[0.58rem] uppercase tracking-[0.16em] text-canopy">
                      {STRENGTH_LABEL[p.strength] ?? p.strength}
                    </p>
                    <p className="text-[0.95rem] leading-relaxed text-pine">
                      {p.statement}
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {letters.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>The letters</SectionLabel>
          <ul className="space-y-6">
            {letters.map((b, i) => (
              <li key={`${b.day}-${b.slot}-${i}`} className="space-y-1.5">
                <Eyebrow primary={formatDay(b.day)} secondary={b.slot} />
                <Voice className="text-[1.05rem] leading-snug text-pine">
                  {b.headline}
                </Voice>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Screen>
  );
}
