"use client";

import { PenLine } from "lucide-react";
import { useCapture } from "@/components/capture-provider";

// The invitation to capture — an offer at the bottom of a screen that has
// already given you something, not a gate at the top of one that hasn't.
// It opens the sheet in place; there is no navigation and no server round-trip
// between wanting to write a line and writing it.
export default function CaptureCue({
  tended,
  isMorning,
}: {
  tended: boolean;
  isMorning: boolean;
}) {
  const { open } = useCapture();

  return (
    <button
      type="button"
      onClick={open}
      className="grove-press-soft flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-sage bg-transparent px-4 py-4 text-left hover:border-canopy hover:bg-dawn/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dawn text-moss">
        <PenLine size={17} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.95rem] text-pine">
          {tended
            ? "Add to it"
            : isMorning
              ? "How are you heading in?"
              : "How did today go?"}
        </span>
        <span className="mt-0.5 block text-[0.78rem] leading-snug text-canopy">
          {tended
            ? "Revise what you set down, or say more."
            : "Say a line — Grove reads it against the rest."}
        </span>
      </span>
    </button>
  );
}
