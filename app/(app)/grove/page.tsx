import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel, Card } from "@/components/ui";
import AskGrove from "@/components/ask-grove";
import { Tree } from "@/components/tree";
import { buildGrove, sinceLabel, type TreeDay } from "@/lib/grove-tree";
import { localDayFromOffset, parseTzOffset, todayISO } from "@/lib/date";

// ============================================================================
// GROVE — the long memory, and the door into it.
// ----------------------------------------------------------------------------
// This tab took the slot that "Goals" was holding. Goals was a screen whose
// entire contents already appeared on Home — rhythms and vectors, verbatim —
// so it was a tab that only repeated another tab, while the three things that
// actually reward a return visit were buried at the bottom of Rhythm under a
// chart. They're here now, in the order they earn attention:
//
//   1. THE TREE — the only view of the WHOLE record. Everything else in Grove
//      is a fourteen-day window. Read lib/grove-tree.ts for the rule it obeys:
//      the trunk is time, so it grows on the weeks you never opened the app;
//      a leaf is a day you set something down; and there is no total.
//   2. ASK — a question about your own record, answered only from what
//      deterministic code has already verified. It used to sit under a 350px
//      tree where nobody scrolled to it.
//   3. THE LETTERS — the archive, grouped by week so it reads as a record
//      rather than as an undifferentiated list of headlines.
//
// A note on §5.3.5 of the design spec, which asked for a leaf-coloured dot on
// each letter matching that day's tone: deliberately NOT done. components/
// tree.tsx refuses to colour a leaf by mood for a reason that applies here
// exactly as well — a green-good / orange-bad canopy is a grade drawn in the
// one place the eye cannot help but total up. Felt state is carried by a leaf's
// LIFT, never by its colour, and the archive doesn't get to import the grade
// the tree was designed to refuse. The week grouping, which was the real fix,
// is here.
// ============================================================================
export default async function GrovePage() {
  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);
  const localDay = offset === null ? todayISO() : localDayFromOffset(offset);

  const supabase = await createClient();
  const uid = (await getUserId())!;

  // The tree is the ONLY thing in Grove that reads outside the fourteen-day
  // window — it is the long memory, and a fortnight-shaped tree would defeat
  // the point. Narrow columns, capped: at two captures a day this covers well
  // over a year, and buildGrove collapses it to one entry per day.
  const [{ data: briefs }, { data: checkinDays }, { data: moveDays }, { data: touchDays }] =
    await Promise.all([
      supabase
        .from("briefs")
        .select("day, slot, headline")
        .eq("user_id", uid)
        .order("day", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("checkins")
        .select("day, mood")
        .eq("user_id", uid)
        .order("day", { ascending: false })
        .limit(800),
      // Phase 7: acting on one of the letter's intentions is setting something
      // down. A day you tended what you said you'd tend is a day on the tree
      // even if you never wrote a line — which is the whole point of making
      // intentions objects. Letting one go counts too: deciding not to do
      // something is a real act, and the tree records acts, never merit.
      supabase
        .from("move_tends")
        .select("day")
        .eq("user_id", uid)
        .order("day", { ascending: false })
        .limit(800),
      supabase
        .from("goal_touches")
        .select("day")
        .eq("user_id", uid)
        .order("day", { ascending: false })
        .limit(800),
    ]);

  // One entry per source day; buildGrove collapses them to one leaf per
  // calendar day and keeps whichever entry carries a mood, so a day that has
  // both a check-in and a tended intention still sits at its felt height.
  const treeDays: TreeDay[] = [
    ...((checkinDays ?? []) as TreeDay[]),
    ...((moveDays ?? []) as { day: string }[]).map((d) => ({ day: d.day, mood: null })),
    ...((touchDays ?? []) as { day: string }[]).map((d) => ({ day: d.day, mood: null })),
  ];

  const grove = buildGrove(treeDays, localDay);
  const weeks = groupByWeek((briefs ?? []) as Letter[], localDay);

  return (
    <Screen className="space-y-10">
      <header className="pt-1">
        <Eyebrow primary="Grove" secondary="the whole record" />
      </header>

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

      {weeks.length > 0 ? (
        <section className="space-y-6">
          <SectionLabel>The letters</SectionLabel>
          {weeks.map((w) => (
            <div key={w.key} className="space-y-4">
              <div className="flex items-center gap-3">
                <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-canopy/80">
                  {w.label}
                </p>
                <span aria-hidden className="h-px flex-1 bg-sage/70" />
              </div>
              <ul className="space-y-5">
                {w.letters.map((b, i) => (
                  <li key={`${b.day}-${b.slot}-${i}`} className="space-y-1.5">
                    <Eyebrow primary={formatDay(b.day)} secondary={b.slot} />
                    <Voice className="text-[1.05rem] leading-snug text-pine">
                      {b.headline}
                    </Voice>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <Card className="space-y-2">
          <Voice className="text-[1.2rem]">No letters yet.</Voice>
          <p className="text-[0.88rem] leading-relaxed text-canopy">
            Set something down and Grove writes back. They collect here, so you
            can read a week of yourself at once.
          </p>
        </Card>
      )}
    </Screen>
  );
}

type Letter = { day: string; slot: string; headline: string };

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const DAY_MS = 86_400_000;

/** Monday of the week a YYYY-MM-DD falls in. Weeks are the unit a person
 *  actually remembers in; a flat list of forty headlines is not a record. */
function weekStart(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday
  return new Date(t - dow * DAY_MS).toISOString().slice(0, 10);
}

function groupByWeek(letters: Letter[], today: string) {
  const thisWeek = weekStart(today);
  const lastWeek = new Date(Date.parse(`${thisWeek}T00:00:00Z`) - 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const buckets = new Map<string, Letter[]>();
  for (const l of letters) {
    const key = weekStart(l.day);
    const arr = buckets.get(key) ?? [];
    arr.push(l);
    buckets.set(key, arr);
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, ls]) => ({
      key,
      label:
        key === thisWeek
          ? "This week"
          : key === lastWeek
            ? "Last week"
            : `Week of ${new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}`,
      letters: ls,
    }));
}
