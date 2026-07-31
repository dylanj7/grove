"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Mic, X, Plus, Leaf } from "lucide-react";
import {
  dictationSupported,
  startDictation,
  type DictationHandle,
} from "@/lib/dictation";
import { localDayISO } from "@/lib/date";
import {
  currentSlot,
  eveningCutoff,
  parseDayStart,
  DAY_START_COOKIE,
  type Slot,
} from "@/lib/slot";
import { capture } from "@/app/(app)/capture/actions";

/** One cookie, by name, on the client. Same read TzCookie does. */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ============================================================================
// CAPTURE — one gesture, ten seconds, and Grove answers.
// ----------------------------------------------------------------------------
// What this replaced: a full page navigation to /checkin, a "Settling in…"
// spinner while three sequential server calls ran (one of which force-synced
// the band over the network before you could type a word), then seven required
// -feeling fields — four of them numeric — and finally a confirmation screen.
// It was a form to fill out, and nobody fills out a form for fun.
//
// The shape now:
//   • It's a SHEET, not a route. No navigation, no server round-trip to open.
//   • The note is the point, and the mic is the primary way in. Speak a
//     sentence and you're done — this is the one thing a notes app can't beat,
//     because Grove understands what you said against your body and your goals.
//   • Everything is optional. The dials start UNSET, so "I didn't say" stays a
//     different fact from "I said the middle" — which is what the old default
//     of 3 was quietly recording.
//   • Body numbers are behind a disclosure. The band covers them for most days;
//     asking every morning was asking for data we already had.
//   • Save is ONE call, and the sheet doesn't wait on it — because the instant
//     it's sent, Grove starts answering.
// ============================================================================

type View = "form" | "reply";

const COPY: Record<Slot, { title: string; prompt: string; submit: string }> = {
  morning: {
    title: "This morning",
    prompt: "How are you heading into today?",
    submit: "Set it down",
  },
  evening: {
    title: "Tonight",
    prompt: "How did the day go?",
    submit: "Set it down",
  },
};

const SCALES: { key: "mood" | "energy" | "focus"; label: string; lo: string; hi: string }[] = [
  { key: "mood", label: "Mood", lo: "heavy", hi: "light" },
  { key: "energy", label: "Energy", lo: "spent", hi: "full" },
  { key: "focus", label: "Focus", lo: "scattered", hi: "clear" },
];

// THE QUICK PATH. Four one-tap reads that fill all three dials at once.
//
// The sheet's fastest honest entry used to be three taps plus a decision about
// what each anonymous bar meant. A person standing in a kitchen doesn't do
// that, and the entry they skip is the day that goes missing from the record —
// which is why the fourteen-day table is nearly all dashes. These are the four
// shapes a day actually comes in; anything more specific belongs in the note.
//
// Deliberately NOT submit-on-tap. A preset fills the dials and leaves the sheet
// open, because the note is still the point and the mic is right there. It's a
// five-second floor, not a five-second ceiling.
const PRESETS: {
  label: string;
  mood: number;
  energy: number;
  focus: number;
}[] = [
  { label: "Good day", mood: 4, energy: 4, focus: 4 },
  { label: "Fine", mood: 3, energy: 3, focus: 3 },
  { label: "Running low", mood: 3, energy: 2, focus: 2 },
  { label: "Heavy", mood: 2, energy: 2, focus: 3 },
];

// A dial that can be UNSET. Five taps, no numbers, no default selection — the
// row reads as a gradient, and the words sit at the ends where they belong.
function Dial({
  label,
  lo,
  hi,
  value,
  onChange,
}: {
  label: string;
  lo: string;
  hi: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-canopy">
          {label}
        </span>
        <span className="text-[0.62rem] uppercase tracking-[0.12em] text-canopy/60">
          {value == null ? "—" : value <= 2 ? lo : value >= 4 ? hi : "even"}
        </span>
      </div>
      {/* Five low, filling segments — a dial, not five checkboxes. The tap
          target stays a comfortable 44px (the padded button); only the visible
          track is short, so an untouched row reads as a faint rule you may
          ignore rather than a form field demanding an answer. */}
      <div role="radiogroup" aria-label={label} className="mt-1 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value != null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${label}, ${n} of 5`}
              onClick={() => onChange(n)}
              className="grove-press group flex h-11 flex-1 items-center focus-visible:outline-none"
            >
              <span
                className={`h-2 w-full rounded-full transition-colors ${
                  on ? "bg-moss" : "bg-sage/60 group-hover:bg-sage"
                } group-focus-visible:ring-2 group-focus-visible:ring-moss/40`}
              />
            </button>
          );
        })}
      </div>
      {/* The poles, AT REST. Without these a first-time user sees three
          anonymous five-segment bars and has to touch one to find out what it
          measures — so the honest response is to not touch any of them. The
          scale has to be legible before it's used, not after. */}
      <div className="mt-1 flex justify-between text-[0.6rem] uppercase tracking-[0.1em] text-canopy/50">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

function BodyInput({
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
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[0.8rem] text-canopy">
        {label}
      </label>
      <div className="relative w-[7.5rem]">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-sage bg-mist pl-3 pr-10 text-[0.95rem] text-soil outline-none transition placeholder:text-canopy/40 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.7rem] uppercase tracking-[0.1em] text-canopy/60">
          {unit}
        </span>
      </div>
    </div>
  );
}

export default function CaptureSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [day] = useState(localDayISO);
  // The same cutoff Home used to pick which letter to show. Read from the
  // cookie rather than recomputed from a default, or a person whose day starts
  // at ten would read an evening letter and then file the capture under
  // "morning" — two halves of one screen disagreeing about what time it is.
  const [slot] = useState<Slot>(() =>
    currentSlot(new Date(), eveningCutoff(parseDayStart(readCookie(DAY_START_COOKIE)))),
  );
  const copy = COPY[slot];

  const [view, setView] = useState<View>("form");
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);

  const [showBody, setShowBody] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyKnown, setBodyKnown] = useState<{ day: string; fromBand: boolean } | null>(null);
  const [sleep, setSleep] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [hrv, setHrv] = useState("");
  const [efficiency, setEfficiency] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyDone, setReplyDone] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- dictation ----
  const micSupported = useSyncExternalStore(
    () => () => {},
    () => dictationSupported(),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<DictationHandle | null>(null);
  const baseRef = useRef("");

  const stopDictation = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setListening(false);
  }, []);

  function toggleMic() {
    if (listening) {
      stopDictation();
      return;
    }
    baseRef.current = note.trim();
    const handle = startDictation({
      onTranscript: (t) => setNote(baseRef.current ? `${baseRef.current} ${t}` : t),
      onEnd: () => {
        dictationRef.current = null;
        setListening(false);
      },
      onError: () => {
        dictationRef.current = null;
        setListening(false);
      },
    });
    if (handle) {
      dictationRef.current = handle;
      setListening(true);
    }
  }

  // ---- sheet lifecycle: lock the page behind it, close on Escape ----
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Focus the note, because the note is the point.
    const t = window.setTimeout(() => textareaRef.current?.focus(), 240);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      dictationRef.current?.stop();
      abortRef.current?.abort();
    };
  }, [onClose]);

  // Opening the body disclosure fills it in from what the app already has,
  // rather than presenting four empty boxes and asking a person to re-type
  // numbers their band synced overnight. If nothing is known it stays empty and
  // nothing is said — the absence is the honest state, not an error.
  async function openBody() {
    setShowBody(true);
    setBodyLoading(true);
    try {
      const res = await fetch(`/api/body/latest?day=${day}`);
      const reading = res.ok ? (await res.json())?.reading : null;
      if (reading) {
        setBodyKnown({ day: reading.day, fromBand: Boolean(reading.fromBand) });
        if (reading.sleepHours != null) setSleep(String(reading.sleepHours));
        if (reading.restingHr != null) setRestingHr(String(Math.round(reading.restingHr)));
        if (reading.hrvMs != null) setHrv(String(Math.round(reading.hrvMs)));
        if (reading.efficiency != null) setEfficiency(String(Math.round(reading.efficiency)));
      }
    } catch {
      // Offline, or the read failed. The inputs still work by hand; saying
      // nothing is better than an error about a convenience.
    } finally {
      setBodyLoading(false);
    }
  }

  function parseNum(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  async function submit() {
    setError(null);
    stopDictation();

    const body = showBody
      ? {
          sleepHours: parseNum(sleep),
          restingHr: parseNum(restingHr),
          hrvMs: parseNum(hrv),
          efficiency: parseNum(efficiency),
        }
      : null;

    if (
      body &&
      [body.sleepHours, body.restingHr, body.hrvMs, body.efficiency].some(
        (v) => v != null && Number.isNaN(v),
      )
    ) {
      setError("One of the body numbers isn't a number. Take another look.");
      return;
    }

    setSaving(true);
    const res = await capture({ day, slot, mood, energy, focus, note, body });
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    // Move to the reply immediately and start streaming. The write is already
    // done; this is Grove being present, not a loading state.
    setView("reply");
    void streamReply();

    // A capture is the honest moment to re-pull the band — but NOT something to
    // wait on. Fired and forgotten; whatever lands is picked up by the next read.
    void fetch(
      `/api/health/sync?day=${day}&tz=${new Date().getTimezoneOffset()}`,
      { method: "POST", keepalive: true },
    ).catch(() => {});

    // Refresh the screen underneath while the reply plays, so closing the sheet
    // lands on an already-updated home rather than a stale one.
    router.refresh();
  }

  async function streamReply() {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, note, mood, energy, focus }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        setReplyDone(true);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setReply((r) => r + decoder.decode(value, { stream: true }));
      }
    } catch {
      // Aborted, offline, or the model was unreachable. The capture is SAVED —
      // that's the part that mattered. Say nothing rather than an error.
    } finally {
      setReplyDone(true);
    }
  }

  const hasSomething =
    note.trim().length > 0 || mood != null || energy != null || focus != null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="grove-scrim absolute inset-0 bg-soil/35 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        className="grove-sheet relative mx-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-sage/70 bg-mist shadow-sheet"
      >
        {/* grab handle */}
        <div className="flex shrink-0 justify-center pt-2.5">
          <div className="h-1 w-9 rounded-full bg-sage" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-3">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-canopy">
            {copy.title}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grove-press -mr-2 flex h-10 w-10 items-center justify-center rounded-full text-canopy hover:text-soil focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
          >
            <X size={19} aria-hidden />
          </button>
        </div>

        {view === "reply" ? (
          // ---- Grove answers ----
          <div className="flex min-h-[16rem] flex-col px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
            {/* THE REWARD MOMENT. The capture used to end by dismissing, which
                meant the one gesture the whole app is built around had no
                acknowledgement at all. This is the leaf landing — the moment
                the metaphor and the mechanic touch — and it plays once, for
                900ms, before the letter starts arriving underneath it. */}
            <p className="mb-5 flex items-center gap-2.5 text-[0.72rem] uppercase tracking-[0.14em] text-canopy">
              <Leaf size={16} aria-hidden className="grove-leaf-land text-moss" />
              A leaf for today
            </p>
            <div className="flex-1">
              {reply ? (
                <p className="grove-fade font-voice text-[1.25rem] leading-[1.5] text-soil">
                  {reply}
                </p>
              ) : replyDone ? (
                <p className="font-voice text-[1.25rem] leading-[1.5] text-canopy">
                  Set down.
                </p>
              ) : (
                <p
                  className="grove-skeleton font-voice text-[1.25rem] text-canopy/70"
                  aria-live="polite"
                >
                  Reading it…
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grove-press mt-8 min-h-[50px] w-full rounded-2xl bg-moss text-[0.78rem] font-medium uppercase tracking-[0.16em] text-mist hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
            >
              Done
            </button>
          </div>
        ) : (
          // ---- Capture ----
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
              <p className="font-voice text-[1.3rem] leading-snug text-soil">
                {copy.prompt}
              </p>

              {/* The note, with the mic as a first-class way in. */}
              <div className="relative mt-4">
                <textarea
                  ref={textareaRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder={
                    micSupported
                      ? "Say it or type it — a line is enough."
                      : "A line is enough."
                  }
                  className="w-full resize-none rounded-2xl border border-sage bg-dawn py-3.5 pl-4 pr-16 text-[1.02rem] leading-relaxed text-soil outline-none transition placeholder:text-canopy/60 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/20"
                />
                {micSupported ? (
                  <button
                    type="button"
                    onClick={toggleMic}
                    aria-pressed={listening}
                    aria-label={listening ? "Stop dictation" : "Dictate"}
                    className={`grove-press absolute bottom-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
                      listening
                        ? "bg-ember text-mist"
                        : "bg-mist text-canopy hover:text-moss"
                    }`}
                  >
                    {listening ? (
                      <span
                        aria-hidden
                        className="grove-halo absolute inset-0 rounded-full bg-ember/40"
                      />
                    ) : null}
                    <Mic
                      size={19}
                      aria-hidden
                      className={listening ? "grove-pulse relative" : "relative"}
                    />
                  </button>
                ) : null}
              </div>

              {/* The five-second path, first — before the dials, because it
                  IS the dials for anyone who isn't going to touch three of
                  them. Tapping one is a complete, valid capture. */}
              <div className="mt-5 flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const on = mood === p.mood && energy === p.energy && focus === p.focus;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setMood(p.mood);
                        setEnergy(p.energy);
                        setFocus(p.focus);
                      }}
                      className={`grove-press min-h-[40px] rounded-full border px-3.5 text-[0.78rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
                        on
                          ? "border-moss bg-moss text-mist"
                          : "border-sage bg-dawn text-pine hover:border-canopy"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 space-y-4">
                {SCALES.map((s) => (
                  <Dial
                    key={s.key}
                    label={s.label}
                    lo={s.lo}
                    hi={s.hi}
                    value={s.key === "mood" ? mood : s.key === "energy" ? energy : focus}
                    onChange={
                      s.key === "mood" ? setMood : s.key === "energy" ? setEnergy : setFocus
                    }
                  />
                ))}
              </div>

              {/* The body, folded away. The band fills this in for most days;
                  asking for it up front was asking twice. */}
              <div className="mt-6 border-t border-sage/70 pt-4">
                {showBody ? (
                  <div className="space-y-3">
                    <p className="text-[0.66rem] font-medium uppercase tracking-[0.16em] text-canopy">
                      Last night
                    </p>
                    {bodyLoading ? (
                      <p className="text-[0.78rem] text-canopy/70" aria-live="polite">
                        Checking what&rsquo;s already in…
                      </p>
                    ) : bodyKnown ? (
                      <p className="text-[0.78rem] leading-relaxed text-canopy">
                        {bodyKnown.fromBand
                          ? "Filled in from your band. Change anything that reads wrong."
                          : "What you set down before. Change anything that reads wrong."}
                      </p>
                    ) : null}
                    <BodyInput id="c-sleep" label="Hours slept" unit="h" value={sleep} onChange={setSleep} placeholder="7.5" />
                    <BodyInput id="c-rhr" label="Resting heart rate" unit="bpm" value={restingHr} onChange={setRestingHr} placeholder="54" />
                    <BodyInput id="c-hrv" label="HRV" unit="ms" value={hrv} onChange={setHrv} placeholder="—" />
                    <BodyInput id="c-eff" label="Sleep efficiency" unit="%" value={efficiency} onChange={setEfficiency} placeholder="—" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void openBody()}
                    className="grove-press flex min-h-[44px] items-center gap-2 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-canopy hover:text-moss focus-visible:outline-none focus-visible:underline"
                  >
                    <Plus size={15} aria-hidden />
                    Add last night&rsquo;s body
                  </button>
                )}
              </div>

              {error ? (
                <p className="mt-4 text-[0.85rem] text-ember" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-sage/70 bg-mist px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
              <button
                type="submit"
                disabled={saving || !hasSomething}
                className="grove-press min-h-[52px] w-full rounded-2xl bg-moss text-[0.78rem] font-medium uppercase tracking-[0.16em] text-mist transition-opacity hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 disabled:opacity-40"
              >
                {saving ? "Setting it down…" : copy.submit}
              </button>
              {/* The button IS enabled by a single dial tap — text was never
                  required. Saying so is the fix: a control that looks disabled
                  with no stated reason reads as "you must write prose", which
                  is the most common reason a journaling app gets abandoned. */}
              {!hasSomething ? (
                <p className="mt-2 text-center text-[0.72rem] text-canopy/70">
                  A word, a tap, anything. One is enough.
                </p>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
