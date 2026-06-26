// The three layout primitives every screen is assembled from. Together with
// the tab bar, they guarantee one visual vocabulary across the app.

import type { ReactNode } from "react";

/**
 * Screen — wraps page content. Owns the top safe-area inset, the standard
 * side padding, the centered phone-width column (Grove stays phone-shaped even
 * on desktop), and the content-rise entrance animation.
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
      <div className={`grove-rise mx-auto w-full max-w-md px-6 pt-6 ${className}`}>
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
}: {
  primary: string;
  secondary?: string;
}) {
  return (
    <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy">
      {primary}
      {secondary ? <span className="text-canopy/60"> · {secondary}</span> : null}
    </p>
  );
}

/**
 * Voice — the serif line(s) Grove speaks to the user. Centered by default;
 * pass `className="text-left"` for letter-like prose. The emotional register.
 */
export function Voice({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-voice text-center leading-[1.45] text-soil ${className}`}>
      {children}
    </p>
  );
}
