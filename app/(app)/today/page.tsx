import Link from "next/link";
import { cookies } from "next/headers";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import HabitRow from "../goals/habit-row";
import { currentSlotFromOffset } from "@/lib/slot";
import { localDayFromOffset, localWeekdayLong, parseTzOffset } from "@/lib/date";
import { loadBriefInputs, resolveBrief, type BriefContent } from "@/lib/brief-read";
import BriefRevalidator from "./brief-revalidator";

const ASPECT_LABEL: Record<string, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

// The brief is downstream of the check-in. If this slot's check-in isn't done,
// the front door is the invitation to do it — never a brief button that
// dead-ends into a form. Once it's done, the brief (generated from it) is here.
//
// This is a Server Component: the check-in and the brief are read in the render,
// so the page ships POPULATED with the route — no client fetch waterfall, no
// "Reading the day…" flash on navigation. The slot and local day come from the
// user's real timezone offset (a client-set cookie), never server time, so the
// correct brief renders on first paint even from another zone.
export default async function TodayPage() {
  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);

  // No offset yet (first-ever load, before the cookie is set): render a
  // layout-stable skeleton. TzCookie (in the app layout) sets the cookie and
  // refreshes, and the correct slot's brief renders. We NEVER guess with server
  // time here — a wrong-slot brief is worse than a beat of skeleton.
  if (offset === null) return <TodaySkeleton />;

  const weekday = localWeekdayLong(offset);
  const slot = currentSlotFromOffset(offset);
  const localDay = localDayFromOffset(offset);
  const isMorning = slot === "morning";

  const supabase = await createClient();
  const uid = (await getSessionUser())!.id;

  // ONE parallel round-trip: the window (which carries the check-ins), the
  // previous letter, the connection state, and the stored brief — all read
  // together. The check-in gate is derived from that same window, so it costs no
  // extra query. Nothing here writes, so it's safe to read before the gate.
  const inputs = await loadBriefInputs(supabase, uid, slot, localDay);

  // The front door when there's nothing to brief on yet — calm, an invitation.
  if (!inputs.hasCheckin) {
    return (
      <Screen className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <Voice className="text-[1.6rem]">
          {isMorning ? "A fresh day." : "The day winds down."}
        </Voice>
        <p className="mt-4 max-w-[18rem] text-sm leading-6 text-canopy">
          {isMorning
            ? "Begin with how you're heading in. The brief follows from it."
            : "Set down how today went. The brief follows from it."}
        </p>
        <Link
          href="/checkin"
          className="mt-9 min-h-[48px] rounded-xl bg-moss px-7 py-3 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          {isMorning ? "Begin the morning" : "Tend this evening"}
        </Link>
      </Screen>
    );
  }

  // Resolve the already-read inputs to a brief: the stored one when the signature
  // matches (the common path — instant, no Claude call), else generate once.
  // Gated behind hasCheckin above, so a brief is never generated before the
  // check-in exists. A failure degrades to a calm line, never a thrown page.
  let brief: BriefContent | null = null;
  try {
    brief = await resolveBrief(supabase, uid, inputs);
  } catch (err) {
    console.error("today brief resolve failed:", err);
  }

  return (
    <Screen>
      <Eyebrow primary={weekday} secondary={isMorning ? "Morning brief" : "Evening brief"} />

      <div className="mt-12">
        {brief ? (
          <BriefArticle brief={brief} isMorning={isMorning} />
        ) : (
          <Voice className="text-lg">
            The brief is just out of reach. Try again in a moment.
          </Voice>
        )}
      </div>

      {/* Post-paint only: sync the band and refresh the page if — and only if —
          the brief actually changed. Never blocks first paint. */}
      {brief ? <BriefRevalidator slot={slot} headline={brief.headline} /> : null}
    </Screen>
  );
}

function BriefArticle({
  brief,
  isMorning,
}: {
  brief: BriefContent;
  isMorning: boolean;
}) {
  return (
    <article className="space-y-9">
      <Voice className="text-[1.7rem]">{brief.headline}</Voice>
      <Voice className="text-left text-[1.05rem] leading-[1.6] text-pine">
        {brief.body}
      </Voice>

      {brief.moves.length > 0 && (
        <div className="space-y-5 border-t border-sage pt-7">
          <Eyebrow primary="What to tend" />
          <ul className="space-y-5">
            {brief.moves.map((m, i) => (
              <li key={i} className="space-y-1.5">
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-canopy">
                  {ASPECT_LABEL[m.aspect] ?? m.aspect}
                </span>
                <p className="font-voice text-[1.05rem] leading-snug text-soil">
                  {m.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The morning's plain, frozen reminder of what to tend — a direct read of
          the user's habits and goals, never the model. */}
      {isMorning &&
        (brief.tend.habits.length > 0 || brief.tend.goals.length > 0) && (
          <div className="space-y-5 border-t border-sage pt-7">
            <Eyebrow primary="To tend today" />
            {brief.tend.habits.length > 0 && (
              <ul className="-mx-2">
                {brief.tend.habits.map((h) => (
                  <HabitRow
                    key={h.id}
                    id={h.id}
                    title={h.title}
                    aspect={h.aspect}
                    recentDays={h.recentDays}
                  />
                ))}
              </ul>
            )}
            {brief.tend.goals.length > 0 && (
              <ul className="-mx-2">
                {brief.tend.goals.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/goals/${g.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
                    >
                      <span className="text-[1.02rem] text-pine">{g.title}</span>
                      <span className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
                        {ASPECT_LABEL[g.aspect] ?? g.aspect}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </article>
  );
}

// Shown only on the first-ever load, before the tz cookie exists — a quiet frame
// the size of the brief, not a spinner. Replaced the instant the cookie lands.
function TodaySkeleton() {
  return (
    <Screen>
      <div className="h-3 w-40 rounded bg-sage/50" />
      <div className="mt-12 space-y-7" aria-hidden>
        <div className="h-7 w-3/4 rounded bg-sage/40" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-sage/30" />
          <div className="h-4 w-11/12 rounded bg-sage/30" />
          <div className="h-4 w-4/5 rounded bg-sage/30" />
        </div>
      </div>
    </Screen>
  );
}
