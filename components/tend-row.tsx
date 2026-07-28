"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { completeHabit, uncompleteHabit } from "@/app/(app)/goals/actions";
import { localDayISO } from "@/lib/date";
import { DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";

// A rhythm for today: two gestures on one row. Tap the mark to tend it (a clean
// binary that resets tomorrow); tap the row to open its record.
//
// The mark is OPTIMISTIC and stays that way. The old version flipped the
// checkbox instantly and then called router.refresh() — a full server render,
// four queries, and a repaint, for a piece of state the client already knew.
// Tapping three habits meant three full page rebuilds. Now the tap is the
// truth: the write goes out in a transition, and only a FAILURE moves the UI
// (back to where it was, with the row saying so). Nothing to wait for.
//
// Still no count, run, or chain anywhere — today only.
export default function TendRow({
  id,
  title,
  aspect,
  recentDays,
}: {
  id: string;
  title: string;
  aspect: string;
  recentDays: string[];
}) {
  const [today] = useState(localDayISO);
  const [done, setDone] = useState(() => recentDays.includes(today));
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !done;
    setDone(next);
    setFailed(false);

    startTransition(async () => {
      const res = next
        ? await completeHabit({ goalId: id, day: today })
        : await uncompleteHabit({ goalId: id, day: today });
      if (!res.ok) {
        setDone(!next);
        setFailed(true);
      }
    });
  }

  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        aria-label={done ? `Mark ${title} not tended today` : `Mark ${title} tended today`}
        className="grove-press flex min-h-[48px] w-12 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
      >
        <span
          className={`flex h-[26px] w-[26px] items-center justify-center rounded-lg border-2 transition-all duration-200 ${
            done
              ? "scale-100 border-moss bg-moss text-mist"
              : "scale-95 border-sage bg-transparent text-transparent"
          }`}
        >
          <Check size={15} strokeWidth={3} aria-hidden />
        </span>
      </button>

      <Link
        href={`/goals/${id}`}
        className="grove-press-soft flex min-h-[48px] flex-1 items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
      >
        <span className="flex flex-col">
          <span
            className={`text-[1.02rem] transition-colors ${
              done ? "text-canopy" : "text-pine"
            }`}
          >
            {title}
          </span>
          {failed ? (
            <span className="text-[0.68rem] text-ember">Didn&rsquo;t save — tap again</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-[0.62rem] uppercase tracking-[0.14em] text-canopy/80">
            {DOMAIN_LABEL[aspect as Domain] ?? aspect}
          </span>
          <ChevronRight size={16} className="text-canopy/60" aria-hidden />
        </span>
      </Link>
    </li>
  );
}
