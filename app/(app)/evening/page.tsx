import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Screen, Eyebrow } from "@/components/ui";
import CheckinForm from "./checkin-form";

// The evening check-in — the one place you give something to Grove. The
// metaphor is carving your own words into the clearing. The form reads today's
// state (by local day) and owns its own headings per state.
export default function EveningPage() {
  return (
    <Screen>
      <Eyebrow primary="This evening" secondary="The check-in" />
      <CheckinForm />

      {/* The body's half. The check-in above is the mind; this is a quiet door
          to the body — sleep and heart. Optional, never a demand. */}
      <div className="mt-14 border-t border-sage pt-8">
        <Link
          href="/body"
          className="-mx-2 flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
        >
          <span>
            <span className="block text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy">
              The body
            </span>
            <span className="mt-1 block text-[0.95rem] text-pine">
              Sleep and heart, by hand
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-canopy/70" />
        </Link>
      </div>
    </Screen>
  );
}
