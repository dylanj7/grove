"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import HabitRow from "../goals/habit-row";
import { currentSlot } from "@/lib/slot";
import { localDayISO } from "@/lib/date";
import { getCheckin } from "../checkin/actions";

type Move = { aspect: string; text: string };
type TendHabit = { id: string; title: string; aspect: string; recentDays: string[] };
type TendGoal = { id: string; title: string; aspect: string };
type Brief = {
  headline: string;
  body: string;
  moves: Move[];
  tend: { habits: TendHabit[]; goals: TendGoal[] };
};

const ASPECT_LABEL: Record<string, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

type State = "loading" | "needs-checkin" | "brief-loading" | "ready" | "error";

// The brief is downstream of the check-in. If this slot's check-in isn't done,
// the front door is the invitation to do it — never a brief button that
// dead-ends into a form. Once it's done, the brief (generated from it) is here.
export default function TodayPage() {
  const [slot] = useState(currentSlot);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      // First: is the relevant check-in done for this slot, this local day?
      const day = localDayISO();
      const checkin = await getCheckin(day, slot);
      if (!alive) return;
      if (!checkin) {
        setState("needs-checkin");
        return;
      }

      setState("brief-loading");
      try {
        const res = await fetch(`/api/brief?slot=${slot}`);
        const json = await res.json();
        if (!alive) return;
        setBrief({
          headline: json.headline,
          body: json.body,
          moves: Array.isArray(json.moves) ? json.moves : [],
          tend: json.tend ?? { habits: [], goals: [] },
        });
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slot]);

  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const isMorning = slot === "morning";

  // The front door when there's nothing to brief on yet — calm, an invitation.
  if (state === "needs-checkin") {
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

  return (
    <Screen>
      <Eyebrow primary={weekday} secondary={isMorning ? "Morning brief" : "Evening brief"} />

      <div className="mt-12">
        {(state === "loading" || state === "brief-loading") && (
          <Voice className="text-lg text-canopy/70">Reading the day…</Voice>
        )}

        {state === "error" && (
          <Voice className="text-lg">
            The brief is just out of reach. Try again in a moment.
          </Voice>
        )}

        {state === "ready" && brief && (
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

            {/* The morning's plain, frozen reminder of what to tend — a direct
                read of the user's habits and goals, never the model. */}
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
        )}
      </div>
    </Screen>
  );
}
