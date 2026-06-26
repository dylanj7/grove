"use client";

import { useEffect, useState } from "react";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { currentSlot } from "@/lib/slot";

type Move = { aspect: string; text: string };
type Brief = { headline: string; body: string; moves: Move[] };

const ASPECT_LABEL: Record<string, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

// The full brief as a composed screen — a short letter, not a dashboard. This
// is a faithful renderer of /api/brief; it never synthesizes anything itself.
export default function TodayPage() {
  const [slot] = useState(currentSlot);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/brief?slot=${slot}`);
        const json = await res.json();
        if (!alive) return;
        setBrief({
          headline: json.headline,
          body: json.body,
          moves: Array.isArray(json.moves) ? json.moves : [],
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

  return (
    <Screen>
      <Eyebrow
        primary={weekday}
        secondary={slot === "morning" ? "Morning brief" : "Evening brief"}
      />

      <div className="mt-12">
        {state === "loading" && (
          // A still, dim line — not a spinner. Even loading is part of the place.
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
          </article>
        )}
      </div>
    </Screen>
  );
}
