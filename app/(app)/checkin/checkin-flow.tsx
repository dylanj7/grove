"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Voice } from "@/components/ui";
import NoteField from "@/components/note-field";
import { localDayISO } from "@/lib/date";
import type { Slot } from "@/lib/slot";
import {
  hoursToMinutes,
  minutesToHours,
  type PhysicalMetrics,
} from "@/lib/physical";
import {
  getCheckin,
  saveCheckin,
  getReading,
  saveReading,
  getBandReading,
} from "./actions";

// ---- The shared worded scale (identical in both slots; only framing shifts) ----
const SCALE_HINTS: Record<string, [string, string]> = {
  Mood: ["heavy", "light"],
  Energy: ["spent", "full"],
  Focus: ["scattered", "clear"],
};

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
          const base = "min-h-[44px] flex-1 rounded-xl border transition-colors";
          const tone = selected ? "border-moss bg-moss" : "border-sage bg-dawn";
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

// ---- A calm number field for the morning body inputs ----
function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy"
      >
        {label}
      </label>
      <div className="relative mt-3">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-[52px] w-full rounded-xl border border-sage bg-dawn pl-4 pr-14 text-[1.1rem] text-soil outline-none transition placeholder:text-canopy/50 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[0.8rem] uppercase tracking-[0.12em] text-canopy/70">
          {unit}
        </span>
      </div>
    </div>
  );
}

function parse(s: string): { value: number | null; bad: boolean } {
  const t = s.trim();
  if (t === "") return { value: null, bad: false };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, bad: true };
  return { value: n, bad: false };
}

const inRange = (n: number, lo: number, hi: number) => n >= lo && n <= hi;

// The band's reading, shaped for quiet display. Observed state, not input —
// when the band measured a metric, Grove shows it rather than asking for it.
function bandRows(band: PhysicalMetrics): [string, string][] {
  const rows: [string, string][] = [];
  const h = minutesToHours(band.sleep_minutes);
  if (h != null) rows.push(["Slept", `${h} h`]);
  if (band.sleep_efficiency != null) rows.push(["Sleep efficiency", `${band.sleep_efficiency}%`]);
  if (band.resting_hr != null) rows.push(["Resting heart rate", `${band.resting_hr} bpm`]);
  if (band.hrv_ms != null) rows.push(["HRV", `${band.hrv_ms} ms`]);
  return rows;
}

function ObservedRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="space-y-5">
      {rows.map(([k, val]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">{k}</dt>
          <dd className="text-[1.05rem] text-pine">{val}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Per-slot framing. Same capture, two contexts. ----
const COPY: Record<
  Slot,
  {
    prompt: string;
    note: string;
    submit: string;
    recorded: string;
    done: string;
    next: string;
  }
> = {
  morning: {
    prompt: "How are you heading into today?",
    note: "An intention for today, if you have one.",
    submit: "Begin the day",
    recorded: "Your morning is tended.",
    done: "The morning is set.",
    next: "Read today's brief",
  },
  evening: {
    prompt: "How did the day go?",
    note: "A line about today, if you have one.",
    submit: "Record the day",
    recorded: "You've already tended this evening.",
    done: "The day is recorded.",
    next: "Read this evening's brief",
  },
};

type View = "loading" | "form" | "recorded" | "done";

export default function CheckinFlow({ slot }: { slot: Slot }) {
  const copy = COPY[slot];
  const isMorning = slot === "morning";

  const [day] = useState(localDayISO);
  const [view, setView] = useState<View>("loading");

  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [focus, setFocus] = useState(3);
  const [note, setNote] = useState("");

  // Morning body inputs (strings while editing).
  const [sleep, setSleep] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [hrv, setHrv] = useState("");
  const [efficiency, setEfficiency] = useState("");

  // What the band already measured for last night (null = no band data — the
  // form falls back to full manual entry, byte-for-byte the pre-band flow).
  const [band, setBand] = useState<PhysicalMetrics | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Each load is independently fallible and none may brick the screen: a
      // failed call degrades to "nothing loaded" and the form still renders.
      // The band especially — manual entry must survive any band failure.
      const [checkin, reading, bandReading] = await Promise.all([
        getCheckin(day, slot).catch(() => null),
        isMorning ? getReading(day).catch(() => null) : Promise.resolve(null),
        isMorning
          ? getBandReading(day, new Date().getTimezoneOffset()).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!alive) return;
      setBand(bandReading);
      if (reading) {
        const h = minutesToHours(reading.sleep_minutes);
        setSleep(h != null ? String(h) : "");
        setRestingHr(reading.resting_hr != null ? String(reading.resting_hr) : "");
        setHrv(reading.hrv_ms != null ? String(reading.hrv_ms) : "");
        setEfficiency(
          reading.sleep_efficiency != null ? String(reading.sleep_efficiency) : "",
        );
      }
      if (checkin) {
        setMood(checkin.mood);
        setEnergy(checkin.energy);
        setFocus(checkin.focus);
        setNote(checkin.note_text ?? "");
        setView("recorded");
      } else {
        setView("form");
      }
    })();
    return () => {
      alive = false;
    };
  }, [day, slot, isMorning]);

  async function submit() {
    setError(null);

    // Morning: validate + save the body reading first, so a check-in is never
    // recorded while the body silently fails.
    if (isMorning) {
      const s = parse(sleep);
      const r = parse(restingHr);
      const v = parse(hrv);
      const e = parse(efficiency);
      if (s.bad || r.bad || v.bad || e.bad) {
        setError("One of the body numbers isn't a number. Take another look.");
        return;
      }
      if (s.value != null && !inRange(s.value, 0, 24)) {
        setError("Hours slept should be between 0 and 24.");
        return;
      }
      if (r.value != null && !inRange(r.value, 25, 220)) {
        setError("That resting heart rate looks off — check it?");
        return;
      }
      if (v.value != null && !inRange(v.value, 0, 400)) {
        setError("That HRV looks off — check it?");
        return;
      }
      if (e.value != null && !inRange(e.value, 0, 100)) {
        setError("Sleep efficiency is a percent — 0 to 100.");
        return;
      }

      // Band-covered metrics are masked out of the manual save: their fields are
      // hidden, but a value prefilled from an earlier hand entry could still sit
      // in state — the manual row should hold only what the user actually chose
      // to enter by hand.
      const metrics: PhysicalMetrics = {
        sleep_minutes: band?.sleep_minutes != null ? null : hoursToMinutes(s.value),
        sleep_efficiency:
          band?.sleep_efficiency != null ? null : e.value != null ? Math.round(e.value) : null,
        resting_hr: band?.resting_hr != null ? null : r.value != null ? Math.round(r.value) : null,
        hrv_ms: band?.hrv_ms != null ? null : v.value != null ? Math.round(v.value) : null,
      };

      setSaving(true);
      const physical = await saveReading(day, metrics);
      if (!physical.ok) {
        setSaving(false);
        setError(physical.error);
        return;
      }
    } else {
      setSaving(true);
    }

    const res = await saveCheckin(day, slot, {
      mood,
      energy,
      focus,
      note_text: note.trim() || null,
    });
    setSaving(false);
    if (res.ok) {
      setView("done");
    } else {
      setError(res.error);
    }
  }

  if (view === "loading") {
    return <Voice className="mt-16 text-lg text-canopy/70">Settling in…</Voice>;
  }

  if (view === "done") {
    return (
      <div className="mt-16 flex flex-col items-center gap-10 text-center">
        <Voice className="text-[1.6rem]">{copy.done}</Voice>
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/today"
            className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine"
          >
            {copy.next}
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

  if (view === "recorded") {
    // The band's metrics are the day's reading for whatever it covered; manual
    // rows appear only for metrics the band didn't measure (they'd be shadowed
    // by provider-over-manual anyway — showing both would be dishonest).
    const observed = isMorning && band ? bandRows(band) : [];
    const bodyRows: [string, string][] = [];
    if (isMorning) {
      if (sleep.trim() && band?.sleep_minutes == null) bodyRows.push(["Slept", `${sleep.trim()} h`]);
      if (restingHr.trim() && band?.resting_hr == null) bodyRows.push(["Resting heart rate", `${restingHr.trim()} bpm`]);
      if (hrv.trim() && band?.hrv_ms == null) bodyRows.push(["HRV", `${hrv.trim()} ms`]);
      if (efficiency.trim() && band?.sleep_efficiency == null) bodyRows.push(["Sleep efficiency", `${efficiency.trim()}%`]);
    }
    return (
      <div className="mt-12 space-y-9">
        <Voice className="text-[1.4rem]">{copy.recorded}</Voice>
        {observed.length > 0 ? (
          <div className="space-y-5">
            <p className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
              Last night, from your band
            </p>
            <ObservedRows rows={observed} />
          </div>
        ) : null}
        {bodyRows.length > 0 ? (
          <dl className="space-y-5">
            {bodyRows.map(([k, val]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">{k}</dt>
                <dd className="text-[1.05rem] text-pine">{val}</dd>
              </div>
            ))}
          </dl>
        ) : null}
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-9"
    >
      <Voice className="text-[1.4rem]">{copy.prompt}</Voice>

      {isMorning ? (
        <div className="space-y-6">
          {band ? (
            <>
              {/* The band already read last night — show it, don't ask for it.
                  Only the metrics it missed remain as inputs. */}
              <p className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
                Last night, from your band
              </p>
              <ObservedRows rows={bandRows(band)} />
              {(band.sleep_minutes == null ||
                band.resting_hr == null ||
                band.hrv_ms == null ||
                band.sleep_efficiency == null) && (
                <p className="pt-2 text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
                  Add what it missed, if you have it
                </p>
              )}
            </>
          ) : (
            <p className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
              Last night&rsquo;s body — enter what you have
            </p>
          )}
          {band?.sleep_minutes == null && (
            <NumberField id="sleep" label="Hours slept" unit="h" value={sleep} onChange={setSleep} placeholder="7.5" />
          )}
          {band?.resting_hr == null && (
            <NumberField id="resting-hr" label="Resting heart rate" unit="bpm" value={restingHr} onChange={setRestingHr} placeholder="54" />
          )}
          {band?.hrv_ms == null && (
            <NumberField id="hrv" label="HRV" unit="ms" value={hrv} onChange={setHrv} placeholder="—" />
          )}
          {band?.sleep_efficiency == null && (
            <NumberField id="efficiency" label="Sleep efficiency" unit="%" value={efficiency} onChange={setEfficiency} placeholder="—" />
          )}
        </div>
      ) : null}

      <div className="space-y-6 border-t border-sage pt-8">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
          {isMorning ? "How you feel, heading in" : "How you feel at day's end"}
        </p>
        <Scale label="Mood" value={mood} onChange={setMood} />
        <Scale label="Energy" value={energy} onChange={setEnergy} />
        <Scale label="Focus" value={focus} onChange={setFocus} />
      </div>

      <NoteField
        id="reflection"
        label="Reflection"
        value={note}
        onChange={setNote}
        placeholder={copy.note}
      />

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="min-h-[48px] w-full rounded-xl bg-moss px-4 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
      >
        {saving ? "Setting it down…" : copy.submit}
      </button>
    </form>
  );
}
