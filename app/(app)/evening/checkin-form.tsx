"use client";

import { useState } from "react";
import Link from "next/link";
import { Voice } from "@/components/ui";
import { saveCheckin } from "./actions";

type Existing = {
  mood: number;
  energy: number;
  focus: number;
  note_text: string | null;
} | null;

const SCALE_HINTS: Record<string, [string, string]> = {
  Mood: ["heavy", "light"],
  Energy: ["spent", "full"],
  Focus: ["scattered", "clear"],
};

// A quiet 1–5 Likert. Single-select (a point on the scale), not a meter that
// fills up — no number going up, no gamified affordance.
function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [lo, hi] = SCALE_HINTS[label];
  return (
    <fieldset>
      <legend className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy">
        {label}
      </legend>
      <div role="radiogroup" aria-label={label} className="mt-3 flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = n === value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${label}, ${n} of 5`}
              onClick={() => onChange(n)}
              className={`min-h-[44px] flex-1 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
                selected
                  ? "border-moss bg-moss"
                  : "border-sage bg-dawn hover:border-canopy"
              }`}
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

export default function CheckinForm({ existing }: { existing: Existing }) {
  const [view, setView] = useState<"recorded" | "form" | "done">(
    existing ? "recorded" : "form",
  );
  const [mood, setMood] = useState(existing?.mood ?? 3);
  const [energy, setEnergy] = useState(existing?.energy ?? 3);
  const [focus, setFocus] = useState(existing?.focus ?? 3);
  const [note, setNote] = useState(existing?.note_text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await saveCheckin({
      mood,
      energy,
      focus,
      note: note.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      setView("done");
    } else {
      // Keep every value exactly as the user left it.
      setError(res.error);
    }
  }

  // Just saved — a still acknowledgment in the clearing. No metrics, no praise.
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

  // Already tended today — show it calmly, with a quiet way to revise.
  if (view === "recorded") {
    return (
      <div className="mt-14 flex flex-col items-center gap-8 text-center">
        <Voice className="text-[1.5rem]">You&rsquo;ve already tended today.</Voice>
        <dl className="flex gap-8">
          {(
            [
              ["Mood", mood],
              ["Energy", energy],
              ["Focus", focus],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-canopy">
                {k}
              </dt>
              <dd className="font-voice text-xl text-soil">{v}</dd>
            </div>
          ))}
        </dl>
        {note.trim() ? (
          <Voice className="max-w-[20rem] text-[1.05rem] text-pine">
            &ldquo;{note.trim()}&rdquo;
          </Voice>
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

  // The capture itself — deliberate, unhurried.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="mt-10 space-y-9"
    >
      <Scale label="Mood" value={mood} onChange={setMood} />
      <Scale label="Energy" value={energy} onChange={setEnergy} />
      <Scale label="Focus" value={focus} onChange={setFocus} />

      <div>
        <label
          htmlFor="reflection"
          className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy"
        >
          Reflection
        </label>
        {/* Voice input is on the roadmap — a clean seam, not built this phase. */}
        <textarea
          id="reflection"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="A line about today, if you have one."
          className="mt-3 w-full resize-none rounded-xl border border-sage bg-dawn px-4 py-3 text-soil outline-none transition placeholder:text-canopy/70 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
        />
      </div>

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
