"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CaptureSheet from "./capture-sheet";

// Capture is an ACTION, not a place. It used to be a route — which meant every
// "I want to write one line" cost a navigation, a server render, and a spinner.
// Hoisting it to the app shell makes it openable from any screen with zero
// round-trips, and it lands you back exactly where you were.
//
// The sheet itself is only mounted while open, so none of its state (dictation
// handles, the streamed reply) leaks between captures.

const CaptureContext = createContext<{ open: () => void } | null>(null);

export function useCapture() {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used inside CaptureProvider");
  return ctx;
}

export default function CaptureProvider({ children }: { children: ReactNode }) {
  const [manualOpen, setManualOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ?capture=1 opens the sheet on arrival — what keeps the old /checkin URL,
  // the PWA shortcut, and any deep link working after capture stopped being a
  // route (they redirect here rather than 404ing).
  //
  // The param is READ as open state rather than copied into state by an effect.
  // Deriving it means one render instead of two, and it makes the URL honest
  // while the sheet is up; closing is what strips it, so a refresh or a back
  // navigation afterwards doesn't reopen the sheet.
  const fromUrl = searchParams.get("capture") === "1";
  const isOpen = manualOpen || fromUrl;

  const openSheet = useCallback(() => setManualOpen(true), []);
  const closeSheet = useCallback(() => {
    setManualOpen(false);
    if (fromUrl) router.replace(pathname, { scroll: false });
  }, [fromUrl, pathname, router]);

  return (
    <CaptureContext.Provider value={{ open: openSheet }}>
      {children}
      {isOpen ? <CaptureSheet onClose={closeSheet} /> : null}
    </CaptureContext.Provider>
  );
}
