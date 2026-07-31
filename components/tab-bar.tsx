"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sunrise, Activity, Plus, Trees, User } from "lucide-react";
import type { ComponentType } from "react";
import { useCapture } from "./capture-provider";

type Tab = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

// FOUR destinations and ONE action.
//
// The old bar had five tabs, two of which — "Grove" and "Today" — were the same
// screen wearing different hats: one showed a tree and a headline, the other
// showed the headline and the rest of the letter. They're merged into Home now.
// "Check-in" was the third tab; it isn't a place you go, it's a thing you do,
// so it's the center action instead — always one thumb-tap away, from anywhere,
// with no navigation at all.
//
// PHASE 7 replaced "Goals" with "Grove". Goals was a tab whose entire contents
// already appeared on Home — rhythms and vectors, verbatim — and a tab that only
// repeats another tab isn't a destination. Its rhythms are now part of Home's
// one tend list; managing them lives under You. The slot went to the tree, the
// letters archive, and Ask Grove, which are the three things in the app that
// actually reward coming back and which were all buried below a chart.
const LEFT: Tab[] = [
  { href: "/home", label: "Home", Icon: Sunrise },
  { href: "/grove", label: "Grove", Icon: Trees },
];
const RIGHT: Tab[] = [
  { href: "/rhythm", label: "Rhythm", Icon: Activity },
  { href: "/you", label: "You", Icon: User },
];

function TabLink({ tab, active }: { tab: Tab; active: boolean }) {
  const { href, label, Icon } = tab;
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        // Tapping the active tab scrolls to top — the native pattern.
        if (active) {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
      className="grove-press flex min-h-[48px] flex-1 flex-col items-center gap-1 px-1 pb-1.5 pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss/40"
    >
      <Icon
        size={21}
        strokeWidth={active ? 2.2 : 1.7}
        className={active ? "text-moss" : "text-canopy"}
      />
      <span
        className={`text-[9.5px] font-medium uppercase tracking-[0.11em] ${
          active ? "text-moss" : "text-canopy/80"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

export default function TabBar() {
  const pathname = usePathname();
  const { open } = useCapture();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sage/70 bg-mist/95 pb-safe backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-md items-center">
        {LEFT.map((t) => (
          <li key={t.href} className="flex flex-1">
            <TabLink tab={t} active={isActive(t.href)} />
          </li>
        ))}

        <li className="flex w-[4.5rem] shrink-0 justify-center">
          <button
            type="button"
            onClick={open}
            aria-label="Capture how you're doing"
            className="grove-press -mt-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-moss text-mist shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/50 focus-visible:ring-offset-2 focus-visible:ring-offset-mist"
          >
            <Plus size={24} strokeWidth={2.2} aria-hidden />
          </button>
        </li>

        {RIGHT.map((t) => (
          <li key={t.href} className="flex flex-1">
            <TabLink tab={t} active={isActive(t.href)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
