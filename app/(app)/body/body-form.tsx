"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Voice } from "@/components/ui";
import { localDayISO } from "@/lib/date";
import {
  hoursToMinutes,
  minutesToHours,
  type PhysicalMetrics,
} from "@/lib/physical";
import { getReading, saveReading } from "./actions";

// A single calm number entry — a label, a wide field, its unit. Not a clinical
// form: every field is optional, blank is always fine, and nothing nags unless a
// number is plainly impossible.
function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
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
      {hint ? (
        <p className="mt-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-canopy/70">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type View = "loading" | "form" | "recorded" | "done";

// Parse a field: blank → absent (null, valid); a number → its value; anything
// else → invalid, so we can ask gently rather than store nonsense.
function parse(s: string): { value: number | null; bad: boolean } {
  const t = s.trim();
  if (t === "") return { value: null, bad: false };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, bad: true };
  return { value: n, bad: false };
}

function inRange(n: number, lo: number, hi: number): boolean {
  return n >= lo && n <= hi;
}

export default function BodyForm() {
  const [day] = useState(localDayISO);
  const [view, setView] = useState<View>("loading");
  const [sleep, setSleep] = useState(""); // hours
  const [restingHr, setRestingHr] = useState("");
  const [hrv, setHrv] = useState("");
  const [efficiency, setEfficiency] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read today's reading by local day; decide whether to invite or show it.
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await getReading(day);
      if (!alive) return;
      if (existing) {
        const h = minutesToHours(existing.sleep_minutes);
        setSleep(h != null ? String(h) : "");
        setRestingHr(existing.resting_hr != null ? String(existing.resting_hr) : "");
        setHrv(existing.hrv_ms != null ? String(existing.hrv_ms) : "");
        setEfficiency(
          existing.sleep_efficiency != null ? String(existing.sleep_efficiency) : "",
        );
        setView("recorded");
      } else {
        setView("form");
      }
    })();
    return () => {
      alive = false;
    };
  }, [day]);

  const anyEntered =
    sleep.trim() !== "" ||
    restingHr.trim() !== "" ||
    hrv.trim() !== "" ||
    efficiency.trim() !== "";

  async function submit() {
    // Gentle, sane-range validation — only on fields actually filled in.
    const s = parse(sleep);
    const r = parse(restingHr);
    const v = parse(hrv);
    const e = parse(efficiency);

    if (s.bad || r.bad || v.bad || e.bad) {
      setError("One of those isn't a number. Take another look.");
      return;
    }
    if (s.value != null && !inRange(s.value, 0, 24)) {
      setError("Hours slept should be somewhere between 0 and 24.");
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

    const metrics: PhysicalMetrics = {
      sleep_minutes: hoursToMinutes(s.value),
      sleep_efficiency: e.value != null ? Math.round(e.value) : null,
      resting_hr: r.value != null ? Math.round(r.value) : null,
      hrv_ms: v.value != null ? Math.round(v.value) : null,
    };

    setSaving(true);
    setError(null);
    const res = await saveReading(day, metrics);
    setSaving(false);
    if (res.ok) {
      setView("done");
    } else {
      // Keep every number exactly as entered.
      setError(res.error);
    }
  }

  if (view === "loading") {
    return <Voice className="mt-16 text-lg text-canopy/70">Settling in…</Voice>;
  }

  // Just recorded — a still acknowledgment. No score, no recovery read here; the
  // body's meaning surfaces in the brief, connected to mind and work, not as a
  // number on its own.
  if (view === "done") {
    return (
      <div className="mt-16 flex flex-col items-center gap-10 text-center">
        <Voice className="text-[1.6rem]">The body is noted.</Voice>
        <div className="flex flex-col items-center gap-4">
          <Link
            href="/today"
            className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine"
          >
            Read today&rsquo;s brief
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

  // Already noted today — show what's recorded, with a quiet way to revise.
  if (view === "recorded") {
    const rows: [string, string][] = [];
    if (sleep.trim()) rows.push(["Slept", `${sleep.trim()} h`]);
    if (restingHr.trim()) rows.push(["Resting heart rate", `${restingHr.trim()} bpm`]);
    if (hrv.trim()) rows.push(["HRV", `${hrv.trim()} ms`]);
    if (efficiency.trim()) rows.push(["Sleep efficiency", `${efficiency.trim()}%`]);

    return (
      <div className="mt-12 space-y-9">
        <Voice className="text-[1.4rem]">Today&rsquo;s body is noted.</Voice>
        <dl className="space-y-5">
          {rows.map(([k, val]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">
                {k}
              </dt>
              <dd className="text-[1.05rem] text-pine">{val}</dd>
            </div>
          ))}
        </dl>
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

  // The capture — enter what you have; nothing is required.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-9"
    >
      <Voice className="text-left text-[1.2rem] leading-snug text-pine">
        Enter what you have. One number or all of them — nothing is required.
      </Voice>

      <NumberField
        id="sleep"
        label="Hours slept"
        unit="h"
        value={sleep}
        onChange={setSleep}
        placeholder="7.5"
      />
      <NumberField
        id="resting-hr"
        label="Resting heart rate"
        unit="bpm"
        value={restingHr}
        onChange={setRestingHr}
        placeholder="54"
      />

      <div className="space-y-6 border-t border-sage pt-8">
        <p className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy/80">
          If you track them elsewhere
        </p>
        <NumberField
          id="hrv"
          label="HRV"
          unit="ms"
          value={hrv}
          onChange={setHrv}
          placeholder="—"
        />
        <NumberField
          id="efficiency"
          label="Sleep efficiency"
          unit="%"
          value={efficiency}
          onChange={setEfficiency}
          placeholder="—"
        />
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving || !anyEntered}
        className="min-h-[48px] w-full rounded-xl bg-moss px-4 text-sm font-medium uppercase tracking-[0.14em] text-mist transition-colors hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-60"
      >
        {saving ? "Setting it down…" : "Note the body"}
      </button>
    </form>
  );
}
