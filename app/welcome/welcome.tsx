"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Screen, Voice, SectionLabel } from "@/components/ui";
import { DOMAINS, DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import { completeWelcome } from "./actions";

// ============================================================================
// SETUP — four questions that are themselves the product.
// ----------------------------------------------------------------------------
// Grove's cold start was the worst thing about it: day one had no data, so no
// letter, so no reason to come back on day two. The fix is not a tour. It is to
// give the first letter something to be about, using the only source available
// before any data exists — the person.
//
// So every question here is doing double duty. "What are you moving toward"
// plants a vector AND tells the day-one letter what this person is for. "What's
// been sitting untended" plants a rhythm AND is, for most people, the most
// honest sentence they'll write all week. Answering feels like using the app
// because it IS using the app.
//
// THREE RULES THIS SCREEN FOLLOWS:
//   1. Everything is skippable. Grove's front door has no gate (Home stopped
//      demanding a check-in before it would say anything); a setup wall would
//      put one back three screens earlier.
//   2. It ends by OPENING THE CAPTURE SHEET, not by congratulating anyone. The
//      spec is explicit and right: no "you're all set!" screen. The last tap of
//      setup is the first tap of the loop.
//   3. It never says how many steps are left as a fraction. A progress bar on
//      a screen this short is a score for filling in a form.
// ============================================================================

type Step = "frame" | "name" | "vector" | "rhythm" | "start";
const ORDER: Step[] = ["frame", "name", "vector", "rhythm", "start"];

// Offered because "when does your day start" is a question people answer badly
// in the abstract and instantly when shown their own answer. 3–12 is the range
// lib/slot.ts will accept; beyond it the morning/evening split stops meaning
// anything.
const HOURS = [5, 6, 7, 8, 9, 10];

function hourLabel(h: number): string {
  return h < 12 ? `${h} am` : "12 pm";
}

export default function Welcome({ preview }: { preview: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [vectorText, setVectorText] = useState("");
  const [vectorDomain, setVectorDomain] = useState<Domain>("work");
  const [rhythmText, setRhythmText] = useState("");
  const [rhythmDomain, setRhythmDomain] = useState<Domain>("physical");
  const [hour, setHour] = useState<number | null>(null);

  const step = ORDER[index];
  const isLast = index === ORDER.length - 1;

  const finish = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await completeWelcome({
        displayName: name,
        vector: vectorText.trim() ? { title: vectorText, domain: vectorDomain } : null,
        rhythm: rhythmText.trim() ? { title: rhythmText, domain: rhythmDomain } : null,
        dayStartsHour: hour,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Straight into the capture sheet. Not a route — ?capture=1 opens it on
      // arrival (components/capture-provider), so the first capture costs one
      // navigation total and lands the person on the screen they'll return to.
      router.replace("/home?capture=1");
    });
  }, [name, vectorText, vectorDomain, rhythmText, rhythmDomain, hour, router]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }, [isLast, finish]);

  const content = useMemo(() => {
    switch (step) {
      case "frame":
        return (
          <div className="space-y-6">
            <div className="space-y-3">
              <Voice className="text-[1.55rem] leading-[1.28]">
                Grove reads your body, your mind, and where you&rsquo;re headed as
                one thing.
              </Voice>
              <p className="text-[0.95rem] leading-relaxed text-canopy">
                It will never score you, rank you, or compare you to last week.
                And it won&rsquo;t tell you a pattern it hasn&rsquo;t checked in
                your own data — so some days it&rsquo;s quiet.
              </p>
            </div>
            <div className="space-y-3 border-t border-sage/70 pt-5">
              <SectionLabel>What this becomes</SectionLabel>
              {preview}
            </div>
          </div>
        );

      case "name":
        return (
          <Question
            prompt="What should Grove call you?"
            help="It writes to you, so it helps to have a name. Skip it and it just won't use one."
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              autoFocus
              placeholder="Your name"
              className="w-full rounded-xl border border-sage/70 bg-dawn px-4 py-3 text-[1.05rem] text-soil placeholder:text-canopy/50 focus-visible:border-moss focus-visible:outline-none"
            />
          </Question>
        );

      case "vector":
        return (
          <Question
            prompt="What are you moving toward?"
            help="One thing, in a phrase. Not a resolution — a direction. This becomes the first thing Grove holds for you."
          >
            <input
              type="text"
              value={vectorText}
              onChange={(e) => setVectorText(e.target.value)}
              autoFocus
              placeholder="Finish the thing I keep restarting"
              className="w-full rounded-xl border border-sage/70 bg-dawn px-4 py-3 text-[1.05rem] text-soil placeholder:text-canopy/50 focus-visible:border-moss focus-visible:outline-none"
            />
            <DomainPicker value={vectorDomain} onChange={setVectorDomain} />
          </Question>
        );

      case "rhythm":
        return (
          <Question
            prompt="What's been sitting untended?"
            help="The one you keep meaning to get back to. Naming it is not a commitment — Grove will offer to let it go as readily as it offers to keep it."
          >
            <input
              type="text"
              value={rhythmText}
              onChange={(e) => setRhythmText(e.target.value)}
              autoFocus
              placeholder="Walking in the morning"
              className="w-full rounded-xl border border-sage/70 bg-dawn px-4 py-3 text-[1.05rem] text-soil placeholder:text-canopy/50 focus-visible:border-moss focus-visible:outline-none"
            />
            <DomainPicker value={rhythmDomain} onChange={setRhythmDomain} />
          </Question>
        );

      case "start":
        return (
          <Question
            prompt="When does your day actually start?"
            help="Not when you'd like it to. This moves when the evening letter takes over from the morning one."
          >
            <div className="flex flex-wrap gap-2">
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHour(h)}
                  aria-pressed={hour === h}
                  className={`grove-press min-h-[44px] rounded-xl border px-4 text-[0.9rem] ${
                    hour === h
                      ? "border-moss bg-moss text-mist"
                      : "border-sage/70 bg-dawn text-pine"
                  }`}
                >
                  {hourLabel(h)}
                </button>
              ))}
            </div>
          </Question>
        );
    }
  }, [step, preview, name, vectorText, vectorDomain, rhythmText, rhythmDomain, hour]);

  return (
    <Screen className="flex min-h-[86dvh] flex-col space-y-8 pb-10">
      <header className="flex items-center justify-between gap-4 pt-1">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy">
          Grove
        </p>
        {/* Position, not progress. Dots say where you are in a short sequence;
            a percentage would say how much of a form you have completed, which
            is the register this whole app is built to avoid. */}
        <div className="flex gap-1.5" aria-hidden>
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i <= index ? "bg-moss" : "bg-sage"
              }`}
            />
          ))}
        </div>
      </header>

      <div className="flex-1">{content}</div>

      {error ? (
        <p role="alert" className="text-[0.85rem] leading-relaxed text-ember">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <button
          type="button"
          onClick={next}
          disabled={pending}
          className="grove-press flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-moss text-[0.74rem] font-medium uppercase tracking-[0.16em] text-mist hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
        >
          {pending ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
          {step === "frame" ? "Begin" : isLast ? "Set down the first one" : "Next"}
          {!pending && step !== "frame" && !isLast ? (
            <ArrowRight size={15} aria-hidden />
          ) : null}
        </button>

        {step !== "frame" ? (
          <button
            type="button"
            onClick={next}
            disabled={pending}
            className="grove-press min-h-[40px] w-full py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-canopy hover:text-soil focus-visible:underline focus-visible:outline-none disabled:opacity-60"
          >
            {isLast ? "Skip and go in" : "Skip this"}
          </button>
        ) : null}
      </div>
    </Screen>
  );
}

function Question({
  prompt,
  help,
  children,
}: {
  prompt: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Voice className="text-[1.45rem] leading-[1.3]">{prompt}</Voice>
        <p className="text-[0.88rem] leading-relaxed text-canopy">{help}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DomainPicker({
  value,
  onChange,
}: {
  value: Domain;
  onChange: (d: Domain) => void;
}) {
  return (
    <div className="flex gap-2">
      {DOMAINS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={value === d}
          className={`grove-press min-h-[40px] flex-1 rounded-xl border text-[0.7rem] font-medium uppercase tracking-[0.12em] ${
            value === d
              ? "border-moss bg-moss/12 text-pine"
              : "border-sage/70 bg-dawn text-canopy"
          }`}
        >
          {DOMAIN_LABEL[d]}
        </button>
      ))}
    </div>
  );
}
