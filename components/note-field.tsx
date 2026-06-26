"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic } from "lucide-react";
import {
  dictationSupported,
  startDictation,
  type DictationHandle,
} from "@/lib/dictation";

// A reflective note field with an optional mic. Built once, reused everywhere a
// note is written (check-in reflection, goal/habit tending). Voice just fills
// the same editable field — speak, then fix a word by typing. If the browser
// can't dictate, the mic simply doesn't appear; the field works as ever.
export default function NoteField({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  // Client-only capability, read without a hydration mismatch: false on the
  // server (so the mic isn't rendered), the real value after hydration.
  const supported = useSyncExternalStore(
    () => () => {},
    () => dictationSupported(),
    () => false,
  );
  const [listening, setListening] = useState(false);
  const handleRef = useRef<DictationHandle | null>(null);
  const baseRef = useRef("");

  // Stop listening if the field unmounts mid-dictation.
  useEffect(() => () => handleRef.current?.stop(), []);

  function toggle() {
    if (listening) {
      handleRef.current?.stop();
      return;
    }
    // Remember what was already written; dictation appends to it.
    baseRef.current = value.trim();
    const handle = startDictation({
      onTranscript: (t) => {
        onChange(baseRef.current ? `${baseRef.current} ${t}` : t);
      },
      onEnd: () => {
        setListening(false);
        handleRef.current = null;
      },
      onError: () => {
        // Permission denied or unavailable — fall back to typing, quietly.
        setListening(false);
        handleRef.current = null;
      },
    });
    if (handle) {
      handleRef.current = handle;
      setListening(true);
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy"
      >
        {label}
      </label>
      <div className="relative mt-3">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full resize-none rounded-xl border border-sage bg-dawn py-3 pl-4 pr-16 text-soil outline-none transition placeholder:text-canopy/70 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-moss/25"
        />
        {supported ? (
          <button
            type="button"
            onClick={toggle}
            aria-pressed={listening}
            aria-label={listening ? "Stop dictation" : "Dictate a note"}
            className={`absolute bottom-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
              listening
                ? "grove-pulse bg-moss text-mist"
                : "bg-mist text-canopy ring-1 ring-sage hover:text-moss"
            }`}
          >
            <Mic size={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
