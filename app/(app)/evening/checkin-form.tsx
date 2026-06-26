"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Voice } from "@/components/ui";
import NoteField from "@/components/note-field";
import { localDayISO } from "@/lib/date";
import { getCheckin, saveCheckin } from "./actions";

const SCALE_HINTS: Record<string, [string, string]> = {
  Mood: ["heavy", "light"],
  Energy: ["spent", "full"],
  Focus: ["scattered", "clear"],
};

// A quiet 1–5 spectrum between two felt words. The chosen point is a *word*,
// not a score: it is never read back to the user as a number. The integer is
// stored only for the honesty engine to reason over.
function Scale({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [lo, hi] = SCALE_HINTS[label];
  return (
    <fieldset>
      <legend className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy">
        {label}
      </legend>
      <div
        role={readOnly ? undefined : "radiogroup"}
        aria-label={label}
        className="mt-3 flex gap-2"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = n === value;
          const base =
            "min-h-[44px] flex-1 rounded-xl border transition-colors";
          const tone = selected
            ? "border-moss bg-moss"
            : "border-sage bg-dawn";
          if (readOnly) {
            return (
              <div
                key={n}
                aria-hidden
                className={`${base} ${selected ? tone : "border-sage bg-dawn/60"}`}
              />
            );
          }
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label}, ${n} of 5`}
              onClick={() => onChange?.(n)}
              className={`${base} ${tone} hover:border-canopy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.65rem] uppercase tracking-[0.12em] text-canopy/70">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </fieldset>
  );
}

type View = "loading" | "form" | "recorded" | "done";

export default function CheckinForm() {
  const [day] = useState(localDayISO);
  const [view, setView] = useState<View>("loading");
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [focus, setFocus] = useState(3);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read today's check-in by local day; decide whether to invite or show it.
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await getCheckin(day);
      if (!alive) return;
      if (existing) {
        setMood(existing.mood);
        setEnergy(existing.energy);
        setFocus(existing.focus);
        setNote(existing.note_text ?? "");
        setView("recorded");
      } else {
        setView("form");
      }
    })();
    return () => {
      alive = false;
    };
  }, [day]);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await saveCheckin(day, {
      mood,
      energy,
      focus,
      note_text: note.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      setView("done");
    } else {
      // Keep every value — especially the words — exactly as left.
      setError(res.error);
    }
  }

  if (view === "loading") {
    return <Voice className="mt-16 text-lg text-canopy/70">Settling in…</Voice>;
  }

  // Just recorded — a still acknowledgment. No metrics, no praise.
  if (view === "done") {
    return (
      <div className="mt-16 flex flex-col items-center gap-10 text-center">
        <Voice className="text-[1.6rem]">The day is recorded.</Voice>
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/today"
            className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine"
          >
            Read this evening&rsquo;s brief
          </Link>
          <Link
            href="/grove"
            className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy transition-colors hover:text-moss"
          >
            Back to the grove
          </Link>
        </div>
      </div>
    );
  }

  // Already tended today — show the felt states back (as positions, never
  // numbers) with a quiet way to revise.
  if (view === "recorded") {
    return (
      <div className="mt-12 space-y-9">
        <Voice className="text-[1.4rem]">You&rsquo;ve already tended today.</Voice>
        <div className="space-y-6">
          <Scale label="Mood" value={mood} readOnly />
          <Scale label="Energy" value={energy} readOnly />
          <Scale label="Focus" value={focus} readOnly />
        </div>
        {note.trim() ? (
          <p className="font-voice text-[1.05rem] leading-snug text-soil">
            &ldquo;{note.trim()}&rdquo;
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => setView("form")}
          className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
        >
          Revise
        </button>
      </div>
    );
  }

  // The capture — deliberate, unhurried.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-9"
    >
      <Voice className="text-[1.4rem]">How did the day go?</Voice>

      <Scale label="Mood" value={mood} onChange={setMood} />
      <Scale label="Energy" value={energy} onChange={setEnergy} />
      <Scale label="Focus" value={focus} onChange={setFocus} />

      <NoteField
        id="reflection"
        label="Reflection"
        value={note}
        onChange={setNote}
        placeholder="A line about today, if you have one."
      />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="min-h-[48px] w-full rounded-xl bg-moss px-4 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
      >
        {saving ? "Setting it down…" : "Record the day"}
      </button>
    </form>
  );
}
