import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronDown } from "lucide-react";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel, Skeleton } from "@/components/ui";
import IntentionList, { type IntentionItem } from "@/components/intentions";
import CaptureCue from "./capture-cue";
import {
  currentSlotFromOffset,
  eveningCutoff,
  parseDayStart,
  DAY_START_COOKIE,
} from "@/lib/slot";
import { localDayFromOffset, localWeekdayLong, parseTzOffset } from "@/lib/date";
import {
  carriedForUi,
  intentionsFor,
  loadBriefInputsCached,
  resolveBrief,
  type BriefInputs,
} from "@/lib/brief-read";
import { deterministicRead, bodyRead, type BodyRead } from "@/lib/read";
import { DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import BriefRevalidator from "@/components/brief-revalidator";
import HomeGrove, { HomeGroveSkeleton } from "@/components/home-grove";

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
//
// PHASE 7 changed what sits under the letter. The letter's moves used to be a
// bulleted list you could not touch, and directly beneath them sat "Rhythms
// today" — a second list saying almost the same thing, with a checkbox. One
// commitment, shown twice, actionable neither time. They are ONE list now
// (components/intentions.tsx), the loop closes, and there is finally a reason
// to open Grove between the two captures.
//
// The order of this screen is deliberate and was wrong before: the letter, then
// the intentions it asked for, then the invitation to add to it — then the
// body, which the letter has already interpreted, and only then the vectors.
// "Add to it" used to be the very last thing on the page, below two sections
// with less claim on the person's attention than it had.
// ============================================================================
export default async function HomePage() {
  const jar = await cookies();
  const offset = parseTzOffset(jar.get("tzoff")?.value);

  // No offset yet (first-ever load, before the cookie is set): a layout-stable
  // skeleton. TzCookie sets the cookie and refreshes. We NEVER guess with
  // server time — a wrong-slot screen is worse than a beat of skeleton.
  if (offset === null) return <HomeSkeleton />;

  const weekday = localWeekdayLong(offset);
  // When the morning hands over to the evening, from the person's own answer in
  // setup. Absent (every account before Phase 8) → the 5pm default, unchanged.
  const cutoff = eveningCutoff(parseDayStart(jar.get(DAY_START_COOKIE)?.value));
  const slot = currentSlotFromOffset(offset, cutoff);
  const localDay = localDayFromOffset(offset);
  const isMorning = slot === "morning";

  const supabase = await createClient();
  const uid = (await getUserId())!;

  // ONE parallel round-trip feeds the entire screen — the window, the previous
  // letter, what's been done with its intentions, the band's connection state,
  // and the stored brief. The Suspense'd letter below re-reads it through
  // React's cache, so it costs nothing twice.
  const inputs = await loadBriefInputsCached(supabase, uid, slot, localDay);

  const read = deterministicRead({
    slot,
    localDay,
    win: inputs.win,
    patterns: inputs.patterns,
    hasCheckin: inputs.hasCheckin,
  });
  const body = bodyRead(inputs.win.physical, localDay);
  const hasBody = body.night.length > 0 || body.today.length > 0;

  // Everything the tend list knows WITHOUT the letter: what's still sitting
  // there from the last one, and today's rhythms. This is what makes the
  // Suspense fallback a working screen rather than a placeholder — on a cold
  // generation you can already tend things while the letter is still being
  // written.
  const baseItems: IntentionItem[] = [
    ...carriedItems(inputs),
    ...rhythmItems(inputs),
  ];

  // A letter is only worth generating once there's something to write about.
  // On an empty account the deterministic read stands alone rather than burning
  // a model call to say "nothing yet" in prettier words.
  //
  // PHASE 8 added the third clause, and it is the whole cold-start fix. Setup
  // asks what you're moving toward and what's been sitting untended, and those
  // answers ARE something to write about — so a day-one letter exists before
  // any capture, any band reading, any pattern. Without this, a new account's
  // first screen was the deterministic read alone, which is honest but is not a
  // reason to come back on day two.
  const worthBriefing = inputs.hasCheckin || hasBody || inputs.win.goals.length > 0;

  // How much record there actually is. Used only to caveat the letter honestly
  // on the first day or two — never displayed as a number, never compared to
  // anything. A letter written off one morning is a real letter and a thin one,
  // and saying which is the difference between setting an expectation and
  // over-promising on the screen where trust is cheapest to lose.
  const recordedDays = new Set([
    ...inputs.win.checkins.map((c) => c.day),
    ...inputs.win.physical.map((p) => p.day),
  ]).size;
  const firstRead = recordedDays <= 1;

  return (
    <Screen className="space-y-8">
      <header className="pt-1">
        <Eyebrow primary={weekday} secondary={isMorning ? "Morning" : "Evening"} />
      </header>

      {worthBriefing ? (
        <Suspense
          fallback={
            <LetterBlock
              headline={read.headline}
              line={read.line}
              items={baseItems}
              isMorning={isMorning}
              firstRead={firstRead}
            />
          }
        >
          <Letter
            inputs={inputs}
            isMorning={isMorning}
            baseItems={baseItems}
            fallbackHeadline={read.headline}
            fallbackLine={read.line}
            firstRead={firstRead}
          />
        </Suspense>
      ) : (
        <LetterBlock
          headline={read.headline}
          line={read.line}
          items={baseItems}
          isMorning={isMorning}
          firstRead={firstRead}
        />
      )}

      {/* An invitation, never a wall — and now directly under the thing it
          continues, rather than stranded at the foot of the page. */}
      <CaptureCue tended={inputs.hasCheckin} isMorning={isMorning} />

      {/* The whole record, small, under the day's work — and behind its own
          boundary, because it reads the entire history rather than the
          fourteen-day window and nothing that slow is allowed on the first
          paint. */}
      <Suspense fallback={<HomeGroveSkeleton />}>
        <HomeGrove localDay={localDay} />
      </Suspense>

      {hasBody ? <BodyCard body={body} isMorning={isMorning} /> : null}

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
                    {DOMAIN_LABEL[g.aspect as Domain] ?? g.aspect}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Post-paint only: sync the band and refresh if the letter actually
          changed. Never blocks first paint. */}
      <BriefRevalidator slot={slot} headline={read.headline} />
    </Screen>
  );
}

// ---- The tend list's two non-letter sources ----------------------------------

// Still open from the letter before this one. Named as such rather than
// silently dropped: an app that quietly forgets what it asked you for is
// teaching you that it didn't mean it.
function carriedItems(inputs: BriefInputs): IntentionItem[] {
  const prev = inputs.prevLetter;
  if (!prev) return [];
  return carriedForUi(inputs).map((i) => ({
    kind: "move" as const,
    id: `carried-${i.key}`,
    day: prev.day,
    slot: prev.slot,
    moveKey: i.key,
    aspect: i.aspect,
    text: i.text,
    state: i.state,
    carried: true,
  }));
}

function rhythmItems(inputs: BriefInputs): IntentionItem[] {
  return inputs.tend.habits.map((h) => ({
    kind: "rhythm" as const,
    id: `rhythm-${h.id}`,
    goalId: h.id,
    aspect: h.aspect,
    text: h.title,
    done: h.recentDays.includes(inputs.localDay),
  }));
}

// ---- The letter --------------------------------------------------------------

// The honest read plus whatever can already be tended. Doubles as the Suspense
// fallback for the letter, so the two never disagree in shape — and stays
// useful on its own, because the rhythms and the carried-forward intentions
// don't need a model to be actionable.
function LetterBlock({
  headline,
  line,
  body,
  items,
  isMorning,
  firstRead = false,
}: {
  headline: string;
  line: string;
  body?: string;
  items: IntentionItem[];
  isMorning: boolean;
  firstRead?: boolean;
}) {
  return (
    <article className="space-y-6">
      <div className="space-y-3">
        <Voice className="text-[1.5rem] leading-[1.28]">{headline}</Voice>
        {body ? (
          <Voice className="text-[1.05rem] leading-[1.65] text-pine">{body}</Voice>
        ) : line ? (
          <p className="text-[1rem] leading-relaxed text-canopy">{line}</p>
        ) : null}
        {/* The caveat is rendered by the SCREEN, not asked of the model.
            Whether a record is one day old is a fact deterministic code knows
            exactly, and a letter told to mention its own thinness would
            sometimes forget and sometimes over-apologise. This says it once,
            quietly, and stops saying it the moment it stops being true. */}
        {firstRead ? (
          <p className="text-[0.8rem] leading-relaxed text-canopy/85">
            This is a first read. It gets sharper once Grove has seen a week of
            you.
          </p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="space-y-3 border-t border-sage/70 pt-5">
          <SectionLabel>{isMorning ? "What to tend" : "What it came to"}</SectionLabel>
          <IntentionList items={items} />
        </div>
      ) : null}
    </article>
  );
}

// The model's letter. Rendered inside Suspense, so a cold generation streams in
// after the shell rather than delaying it. A failure degrades to the same
// deterministic read the fallback showed — the screen never goes empty, and the
// tend list survives either way.
async function Letter({
  inputs,
  isMorning,
  baseItems,
  fallbackHeadline,
  fallbackLine,
  firstRead,
}: {
  inputs: BriefInputs;
  isMorning: boolean;
  baseItems: IntentionItem[];
  fallbackHeadline: string;
  fallbackLine: string;
  firstRead: boolean;
}) {
  const supabase = await createClient();
  const uid = (await getUserId())!;

  let brief = null;
  try {
    brief = await resolveBrief(supabase, uid, inputs);
  } catch (err) {
    console.error("home letter resolve failed:", err);
  }

  if (!brief) {
    return (
      <LetterBlock
        headline={fallbackHeadline}
        line={fallbackLine}
        items={baseItems}
        isMorning={isMorning}
        firstRead={firstRead}
      />
    );
  }

  // Today's asks first, then what's still sitting there, then the rhythms.
  const todays = intentionsFor(inputs, brief.moves).map((i) => ({
    kind: "move" as const,
    id: `move-${i.key}`,
    day: inputs.day,
    slot: inputs.slot,
    moveKey: i.key,
    aspect: i.aspect,
    text: i.text,
    state: i.state,
  }));

  // A move re-issued from yesterday is one intention, not two rows saying the
  // same sentence with different badges. Today's copy wins.
  const todaysKeys = new Set(todays.map((i) => i.moveKey));
  const rest = baseItems.filter((i) => {
    if (i.kind !== "move") return true;
    return !todaysKeys.has(i.moveKey);
  });

  return (
    <div className="grove-fade">
      <LetterBlock
        headline={brief.headline}
        line=""
        body={brief.body}
        items={[...todays, ...rest]}
        isMorning={isMorning}
        firstRead={firstRead}
      />
    </div>
  );
}

// ---- The body ----------------------------------------------------------------

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

function readingAge(body: BodyRead): string | null {
  if (!body.nightDay || body.nightAgeDays == null) return null;
  if (body.nightAgeDays <= 1) return null;
  const when =
    body.nightAgeDays < 7
      ? WEEKDAY.format(new Date(`${body.nightDay}T00:00:00Z`))
      : new Date(`${body.nightDay}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        });
  return `Last read ${when}. These numbers are from then.`;
}

/**
 * The body, collapsed.
 *
 * It used to be five inert numbers on a card — 7h 24m / 95% / 53 / 73ms / 876 —
 * with no meaning attached and no way to tell whether they were from last night
 * or from Monday. Two things changed. The card is SHUT by default, because the
 * letter above it has already interpreted these numbers and a stat grid
 * restates them in the one register Grove doesn't speak. And the reading now
 * carries its own age, loudly, when it's old: Home presenting four-day-old
 * numbers as last night's — while the letter reasoned off them — is the fastest
 * way to lose a person's trust in everything else the screen says.
 *
 * A native <details>, so the affordance costs no client JavaScript and the
 * disclosure is keyboard- and screen-reader-correct for free.
 */
function BodyCard({ body, isMorning }: { body: BodyRead; isMorning: boolean }) {
  const age = readingAge(body);

  return (
    <section className="space-y-3">
      <SectionLabel right={body.stale ? undefined : isMorning ? "last night" : "today"}>
        Body
      </SectionLabel>
      {/* Not <Card>: Card owns its own padding, and the disclosure needs its
          summary to be the full tap target edge to edge. Same surface, stated
          directly rather than fought with an override. */}
      <div className="overflow-hidden rounded-2xl border border-sage/70 bg-dawn shadow-soft">
        <details className="group">
          <summary className="grove-press-soft flex cursor-pointer list-none items-center gap-3 rounded-2xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.95rem] leading-snug text-pine">
                {body.summary}
              </span>
              <span className="mt-0.5 block text-[0.76rem] leading-snug text-canopy">
                {age ?? "Tap for the numbers."}
              </span>
            </span>
            <ChevronDown
              size={17}
              aria-hidden
              className="shrink-0 text-canopy transition-transform duration-200 group-open:rotate-180"
            />
          </summary>

          <div className="space-y-5 border-t border-sage/70 px-5 py-4">
            {body.night.length > 0 ? (
              <FactGroup
                label={age ? "The night measured" : "Last night"}
                facts={body.night}
              />
            ) : null}
            {body.today.length > 0 ? <FactGroup label="Today" facts={body.today} /> : null}
          </div>
        </details>
      </div>
    </section>
  );
}

function FactGroup({
  label,
  facts,
}: {
  label: string;
  facts: { label: string; value: string; usual?: string }[];
}) {
  return (
    <div className="space-y-3">
      <p className="text-[0.6rem] uppercase tracking-[0.14em] text-canopy/70">{label}</p>
      <div className="flex flex-wrap gap-x-7 gap-y-4">
        {facts.map((f) => (
          <div key={f.label} className="min-w-[4.5rem]">
            <p className="text-[0.6rem] uppercase tracking-[0.14em] text-canopy">{f.label}</p>
            <p className="mt-1 text-[1.15rem] font-medium text-pine">{f.value}</p>
            {/* Their own usual, as a reference — the same job the chart's dashed
                line does. Never a delta, never a sign, never a verdict. */}
            {f.usual ? (
              <p className="mt-0.5 text-[0.66rem] text-canopy/80">usually {f.usual}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
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
