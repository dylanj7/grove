"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trees, Sun, PenLine, Target, User } from "lucide-react";
import type { ComponentType } from "react";

type Tab = {
  href: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
};

// Five tabs are the spine. "Check-in" earns its own tab — it's the single write
// path (morning and evening now) and must be one thumb-tap away. History +
// settings live under "You".
const TABS: Tab[] = [
  { href: "/grove", label: "Grove", Icon: Trees },
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/checkin", label: "Check-in", Icon: PenLine },
  { href: "/goals", label: "Goals", Icon: Target },
  { href: "/history", label: "You", Icon: User },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sage bg-mist pb-safe"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  // Tapping the active tab scrolls to top — the native pattern.
                  if (active) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="flex min-h-[44px] flex-col items-center gap-1 px-1 pb-1.5 pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss/40"
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2 : 1.6}
                  className={active ? "text-moss" : "text-canopy"}
                />
                <span
                  className={`text-[10px] font-medium uppercase tracking-[0.12em] ${
                    active ? "text-moss" : "text-canopy/80"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
