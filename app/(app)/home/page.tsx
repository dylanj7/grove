import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel, Card, Skeleton } from "@/components/ui";
import TendRow from "@/components/tend-row";
import CaptureCue from "./capture-cue";
import { currentSlotFromOffset } from "@/lib/slot";
import { localDayFromOffset, localWeekdayLong, parseTzOffset } from "@/lib/date";
import { loadBriefInputsCached, resolveBrief, type BriefInputs } from "@/lib/brief-read";
import { deterministicRead, bodyFacts } from "@/lib/read";
import BriefRevalidator from "@/components/brief-revalidator";

const ASPECT_LABEL: Record<string, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

// ============================================================================
// HOME — the front door, and the whole reason the app is worth opening.
// ----------------------------------------------------------------------------
// It replaces two screens that were really one:
//   /grove  — a breathing tree and a single sentence
//   /today  — the same sentence, plus the rest of the letter, BEHIND A GATE
//
// The gate is gone. /today used to check whether this slot's check-in existed
// and, if not, render a wall: a button to go fill in a form. That is the app
// demanding tribute before it gives you anything, on the one screen that is
// supposed to earn the visit.
//
// Now the screen always says something true (lib/read.ts computes it from the
// same window, deterministically, in microseconds) and the model's letter
// arrives ON TOP of that when it's ready — as a Suspense boundary whose
// FALLBACK is the honest read. On the common path the letter is cached and
// resolves in the same tick, so you just see the letter. On a cold generation
// you see the true read immediately and the letter fades in a few seconds
// later. An LLM call is never again allowed to hold the first paint hostage.
// ============================================================================
export default async function HomePage() {
  const offset = parseTzOffset((await cookies()).get("tzoff")?.value);

  // No offset yet (first-ever load, before the cookie is set): a layout-stable
  // skeleton. TzCookie sets the cookie and refreshes. We NEVER guess with
  // server time — a wrong-slot screen is worse than a beat of skeleton.
  if (offset === null) return <HomeSkeleton />;

  const weekday = localWeekdayLong(offset);
  const slot = currentSlotFromOffset(offset);
  const localDay = localDayFromOffset(offset);
  const isMorning = slot === "morning";

  const supabase = await createClient();
  const uid = (await getUserId())!;

  // ONE parallel round-trip feeds the entire screen — the window, the previous
  // letter, the band's connection state, and the stored brief. The Suspense'd
  // letter below re-reads it through React's cache, so it costs nothing twice.
  const inputs = await loadBriefInputsCached(supabase, uid, slot, localDay);

  const read = deterministicRead({
    slot,
    localDay,
    win: inputs.win,
    patterns: inputs.patterns,
    hasCheckin: inputs.hasCheckin,
  });
  const facts = bodyFacts(inputs.win.physical);

  // A letter is only worth generating once there's something to write about.
  // On an empty account the deterministic read stands alone rather than burning
  // a model call to say "nothing yet" in prettier words.
  const worthBriefing = inputs.hasCheckin || facts.length > 0;

  return (
    <Screen className="grove-stagger space-y-8">
      <header className="flex items-baseline justify-between gap-3 pt-1">
        <Eyebrow primary={weekday} secondary={isMorning ? "Morning" : "Evening"} />
        {inputs.hasCheckin ? (
          <span className="text-[0.62rem] uppercase tracking-[0.14em] text-canopy/60">
            Tended
          </span>
        ) : null}
      </header>

      {worthBriefing ? (
        <Suspense fallback={<ReadBlock headline={read.headline} line={read.line} />}>
          <Letter inputs={inputs} isMorning={isMorning} fallbackHeadline={read.headline} fallbackLine={read.line} />
        </Suspense>
      ) : (
        <ReadBlock headline={read.headline} line={read.line} />
      )}

      {/* The body, as observed state. Present with zero input from the user
          when a band is connected — value before it asks for anything. */}
      {facts.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel right={isMorning ? "last night" : "today"}>Body</SectionLabel>
          <Card className="flex flex-wrap gap-x-7 gap-y-4">
            {facts.map((f) => (
              <div key={f.label} className="min-w-[4.5rem]">
                <p className="text-[0.6rem] uppercase tracking-[0.14em] text-canopy">
                  {f.label}
                </p>
                <p className="mt-1 text-[1.15rem] font-medium text-pine">{f.value}</p>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* Today's rhythms — tappable in place, no navigation, no server wait. */}
      {inputs.tend.habits.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Rhythms today</SectionLabel>
          <ul className="-mx-2">
            {inputs.tend.habits.map((h) => (
              <TendRow
                key={h.id}
                id={h.id}
                title={h.title}
                aspect={h.aspect}
                recentDays={h.recentDays}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {inputs.tend.goals.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Moving toward</SectionLabel>
          <ul className="-mx-2">
            {inputs.tend.goals.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/goals/${g.id}`}
                  className="grove-press-soft flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
                >
                  <span className="text-[1.02rem] text-pine">{g.title}</span>
                  <span className="text-[0.62rem] uppercase tracking-[0.14em] text-canopy/80">
                    {ASPECT_LABEL[g.aspect] ?? g.aspect}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* An invitation, never a wall — the screen above already gave value. */}
      <CaptureCue tended={inputs.hasCheckin} isMorning={isMorning} />

      {/* Post-paint only: sync the band and refresh if the letter actually
          changed. Never blocks first paint. */}
      <BriefRevalidator slot={slot} headline={read.headline} />
    </Screen>
  );
}

// The honest read: what Grove can say with certainty, instantly. Doubles as the
// Suspense fallback for the letter, so the two never disagree in shape.
function ReadBlock({ headline, line }: { headline: string; line: string }) {
  return (
    <article className="space-y-3">
      <Voice className="text-[1.5rem] leading-[1.28]">{headline}</Voice>
      {line ? (
        <p className="text-[1rem] leading-relaxed text-canopy">{line}</p>
      ) : null}
    </article>
  );
}

// The model's letter. Rendered inside Suspense, so a cold generation streams in
// after the shell rather than delaying it. A failure degrades to the same
// deterministic read the fallback showed — the screen never goes empty.
async function Letter({
  inputs,
  isMorning,
  fallbackHeadline,
  fallbackLine,
}: {
  inputs: BriefInputs;
  isMorning: boolean;
  fallbackHeadline: string;
  fallbackLine: string;
}) {
  const supabase = await createClient();
  const uid = (await getUserId())!;

  let brief = null;
  try {
    brief = await resolveBrief(supabase, uid, inputs);
  } catch (err) {
    console.error("home letter resolve failed:", err);
  }

  if (!brief) return <ReadBlock headline={fallbackHeadline} line={fallbackLine} />;

  return (
    <article className="grove-fade space-y-6">
      <Voice className="text-[1.5rem] leading-[1.28]">{brief.headline}</Voice>
      <Voice className="text-[1.05rem] leading-[1.65] text-pine">{brief.body}</Voice>

      {brief.moves.length > 0 && (
        <div className="space-y-4 border-t border-sage/70 pt-5">
          <SectionLabel>{isMorning ? "What to tend" : "What it came to"}</SectionLabel>
          <ul className="space-y-4">
            {brief.moves.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ember"
                />
                <div className="space-y-0.5">
                  <span className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-canopy">
                    {ASPECT_LABEL[m.aspect] ?? m.aspect}
                  </span>
                  <p className="font-voice text-[1.05rem] leading-snug text-soil">
                    {m.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

// Shown only on the first-ever load, before the tz cookie exists — a quiet
// frame the size of the content, not a spinner.
function HomeSkeleton() {
  return (
    <Screen className="space-y-8">
      <Skeleton className="h-3 w-40" />
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
    </Screen>
  );
}
