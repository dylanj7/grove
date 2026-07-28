import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel, Card } from "@/components/ui";
import RhythmChart from "@/components/rhythm-chart";
import AskGrove from "@/components/ask-grove";
import { Tree } from "@/components/tree";
import { loadWindow } from "@/lib/window";
import { detectPatterns } from "@/lib/patterns";
import { buildRhythm } from "@/lib/rhythm";
import { buildGrove, sinceLabel, type TreeDay } from "@/lib/grove-tree";
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
// Four registers, zooming in, in descending order of certainty:
//
//   1. THE GROVE — your whole record at once, as a tree. The trunk is time, a
//      leaf is a day you set something down, and where a leaf sits is how that
//      day felt. It tracks; it does not measure. (lib/grove-tree.ts explains
//      why that distinction had to be designed rather than promised.)
//   2. ASK — a question about your own record, answered only from what
//      deterministic code has already verified. The one thing here that isn't
//      a display: it's the honesty layer with a door on it.
//   3. THE CHART — the last fourteen days, unmediated. No interpretation.
//   4. WHAT'S TRUE — the patterns lib/patterns.ts verified in code. Still no
//      model: these are the exact statements the letter and the answers are
//      permitted to draw on, shown plainly so neither can ever seem to know
//      more than it does.
//   5. THE LETTERS — the archive, last.
//
// Nothing here is a score, a streak, or a comparison — not even against the
// user's own past. It's a record you can look at, and now one you can question.
// ============================================================================
export default async function RhythmPage() {
  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);
  const localDay = offset === null ? todayISO() : localDayFromOffset(offset);

  const supabase = await createClient();
  const uid = (await getUserId())!;

  const [win, { data: briefs }, { data: allDays }] = await Promise.all([
    loadWindow(supabase, uid),
    supabase
      .from("briefs")
      .select("day, slot, headline, body")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
    // The tree is the ONLY thing in Grove that reads outside the fourteen-day
    // window — it is the long memory, and a fortnight-shaped tree would defeat
    // the point. Two narrow columns, capped: at two captures a day this covers
    // well over a year, and buildGrove collapses it to one entry per day.
    supabase
      .from("checkins")
      .select("day, mood")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .limit(800),
  ]);

  const rhythm = buildRhythm(win, localDay);
  const grove = buildGrove((allDays ?? []) as TreeDay[], localDay);
  const patterns = detectPatterns(win.physical, win.checkins, win.touches, win.goals)
    // checkin_state is a restatement of the most recent capture, not a trend —
    // it exists to give the model material, and it would be noise here.
    .filter((p) => p.code !== "checkin_state");

  const letters = briefs ?? [];

  return (
    <Screen className="space-y-10">
      <header className="pt-1">
        <Eyebrow primary="Rhythm" secondary="your record" />
      </header>

      {/* THE GROVE. Deliberately first and deliberately large: it is the only
          view of the whole thing, and the only part of the app that rewards
          simply having kept at it — without scoring how well. */}
      <section className="space-y-3">
        <Tree shape={grove} className="mx-auto block h-[15rem] w-full max-w-[16rem]" />
        <p className="text-center text-[0.78rem] leading-relaxed text-canopy">
          {grove.firstDay ? (
            <>
              A leaf for every day you&rsquo;ve set something down, since{" "}
              {sinceLabel(grove.firstDay)}. Where a leaf sits is how that day
              felt &mdash; not how well it went.
            </>
          ) : (
            <>
              Your grove hasn&rsquo;t been planted yet. Set something down and
              the first leaf arrives.
            </>
          )}
        </p>
      </section>

      <AskGrove />

      {rhythm.hasAny ? (
        <section className="space-y-3">
          <SectionLabel right="last 14 days">The shape of it</SectionLabel>
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
