// The layout primitives every screen is assembled from. Together with the tab
// bar, they guarantee one visual vocabulary across the app.

import type { ReactNode } from "react";

/**
 * Screen — wraps page content. Owns the top safe-area inset, the standard side
 * padding, the centered phone-width column (Grove stays phone-shaped even on
 * desktop), and the single entrance animation.
 *
 * The entrance lives HERE rather than on each page for a reason: it is one
 * animation on one element, so every screen in the app arrives the same way and
 * arrives once. The previous approach staggered every section of every screen
 * and re-ran the whole cascade on each navigation — see .grove-enter in
 * globals.css for why that was most of what felt choppy.
 */
export function Screen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="pt-safe">
      <div className={`grove-enter mx-auto w-full max-w-md px-5 pt-5 ${className}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * Eyebrow — the uppercase sans signpost at the top of a screen, e.g.
 * "TUESDAY · MORNING". The navigational register.
 */
export function Eyebrow({
  primary,
  secondary,
  className = "",
}: {
  primary: string;
  secondary?: string;
  className?: string;
}) {
  return (
    <p
      className={`text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy ${className}`}
    >
      {primary}
      {secondary ? <span className="text-canopy/60"> · {secondary}</span> : null}
    </p>
  );
}

/**
 * Voice — the serif line(s) Grove speaks to the user. Left-aligned by default
 * now: Grove writes to you, and centered prose reads as a poster, not a letter.
 * Pass `className="text-center"` for the rare standalone statement.
 */
export function Voice({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-voice leading-[1.45] text-soil ${className}`}>
      {children}
    </p>
  );
}

/**
 * SectionLabel — the small heading above a group of rows. Quieter than an
 * Eyebrow and always attached to content below it.
 */
export function SectionLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[0.66rem] font-medium uppercase tracking-[0.18em] text-canopy">
        {children}
      </h2>
      {right ? (
        <span className="text-[0.66rem] uppercase tracking-[0.14em] text-canopy/60">
          {right}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Card — a raised surface. The app used to be entirely flat on one background,
 * which made every screen read as one undifferentiated column of text. A card
 * gives the eye somewhere to land.
 */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-sage/70 bg-dawn p-5 shadow-soft ${className}`}
    >
      {children}
    </div>
  );
}

/** Skeleton — a quiet breathing block the shape of the content that's coming. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`grove-skeleton rounded-lg bg-sage/40 ${className}`}
    />
  );
}
