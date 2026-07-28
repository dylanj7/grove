"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { localDayISO } from "@/lib/date";
import type { Slot } from "@/lib/slot";

// The band's freshness, kept OFF the render path. The brief the page rendered
// reflects the band's data as of its last sync — honest and instant. This runs
// AFTER first paint: it hits /api/brief (which syncs the band, then re-reads),
// and refreshes the page ONLY if that produced a genuinely new brief. A synced
// number arriving a beat later is the two-layer model working, not a violation.
//
// It settles in at most one refresh: the sync is lazy and per-day cached, so the
// second pass finds nothing new (cached: true) and stops.
export default function BriefRevalidator({
  slot,
  headline,
}: {
  slot: Slot;
  headline: string;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const tz = new Date().getTimezoneOffset();
    const day = localDayISO();
    fetch(`/api/brief?slot=${slot}&day=${day}&tz=${tz}`)
      .then((r) => r.json())
      .then((json) => {
        // Refresh only when the sync actually changed the brief. `cached: false`
        // means it regenerated; the headline check guards the rare case where a
        // regenerate lands identical text.
        if (json && json.cached === false && json.headline !== headline) {
          router.refresh();
        }
      })
      .catch(() => {
        // A failed post-paint sync is a no-op: the rendered brief stands.
      });
  }, [slot, headline, router]);

  return null;
}
