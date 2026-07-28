"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Choice = "system" | "light" | "dark";

const KEY = "grove-theme";

// ---------------------------------------------------------------------------
// The stored choice, modelled as the external store it actually is.
//
// localStorage is not React state — it's a platform API that other tabs can
// also write to. Reading it into state inside an effect would render once with
// the wrong answer and again with the right one, and would never notice another
// tab changing it. useSyncExternalStore reads it directly, keeps the server
// render honest ("system", which is what the markup ships as), and picks up
// cross-tab changes for free.
// ---------------------------------------------------------------------------
let listeners: (() => void)[] = [];

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): Choice {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    // Private mode or blocked storage: follow the OS, which is the right
    // fallback and the same thing the pre-hydration script does.
    return "system";
  }
}

const getServerSnapshot = (): Choice => "system";

const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Auto", Icon: Monitor },
  { value: "light", label: "Day", Icon: Sun },
  { value: "dark", label: "Night", Icon: Moon },
];

// Grove now has a night. This picks between following the OS and pinning one —
// globals.css defines every token under all three scopes, so the choice is a
// single attribute on <html> and nothing else in the app changes.
export default function ThemeToggle() {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function pick(next: Choice) {
    const root = document.documentElement;
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      // Can't persist it; still apply it for this session.
    }
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    emit();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 rounded-xl border border-sage bg-dawn p-1"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(value)}
            className={`grove-press flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40 ${
              active ? "bg-mist text-moss shadow-soft" : "text-canopy hover:text-pine"
            }`}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
