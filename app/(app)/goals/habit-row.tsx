"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { completeHabit, uncompleteHabit } from "./actions";
import { localDayISO } from "@/lib/date";
import { DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";

// A habit in the list: two distinct gestures. Tap the checkbox to complete
// today (a clean binary that resets tomorrow); tap the row to open its record.
// The list shows today only — never a count, run, or chain.
export default function HabitRow({
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
  const router = useRouter();
  const [today] = useState(localDayISO);
  const [done, setDone] = useState(recentDays.includes(today));
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !done;
    setDone(next); // optimistic — the quiet settle
    setPending(true);
    const res = next
      ? await completeHabit({ goalId: id, day: today })
      : await uncompleteHabit({ goalId: id, day: today });
    setPending(false);
    if (!res.ok) {
      setDone(!next); // revert on failure
    } else {
      router.refresh();
    }
  }

  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        aria-label={
          done ? `Mark ${title} not done today` : `Mark ${title} done today`
        }
        className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
            done
              ? "border-moss bg-moss text-mist"
              : "border-sage bg-dawn text-transparent"
          }`}
        >
          <Check size={14} strokeWidth={2.5} />
        </span>
      </button>

      <Link
        href={`/goals/${id}`}
        className="flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
      >
        <span className="text-[1.02rem] text-pine">{title}</span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
            {DOMAIN_LABEL[aspect as Domain] ?? aspect}
          </span>
          <ChevronRight size={16} className="text-canopy/70" />
        </span>
      </Link>
    </li>
  );
}
