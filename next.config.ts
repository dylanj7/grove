import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE ON VIEW TRANSITIONS, so this isn't rediscovered later: React's
  // <ViewTransition> would be the ideal fix for navigation feel, and Next has an
  // `experimental.viewTransition` flag for it — but on Next 16.2.9 that flag does
  // NOT switch the build to the React experimental channel (only `taint`,
  // `transitionIndicator` and `gestureTransition` do, per
  // next/dist/lib/needs-experimental-react.js), and `unstable_ViewTransition` is
  // not exported by the stable React 19.2.4 this project installs. Turning the
  // flag on therefore yields an undefined import at runtime, not a crossfade.
  // The enter animation in globals.css (.grove-enter) does the reachable part of
  // the job with no experimental surface at all.

  // The information architecture changed — five tabs collapsed to four
  // destinations plus one action — so every old path is redirected rather than
  // left to 404. These are config redirects, not redirect pages: they're
  // answered before any React renders, so an old bookmark or a PWA shortcut
  // costs a header, not a round-trip through the app shell.
  async redirects() {
    return [
      // /today was the letter behind a gate; it's Home. (/grove was redirected
      // here too, until Phase 7 gave the name back to the screen it describes:
      // the tree, the letters, and Ask now live at /grove again.)
      { source: "/today", destination: "/home", permanent: false },
      // Capture stopped being a place and became an action. ?capture=1 opens
      // the sheet on arrival (see components/capture-provider).
      { source: "/checkin", destination: "/home?capture=1", permanent: false },
      { source: "/body", destination: "/home?capture=1", permanent: false },
      { source: "/evening", destination: "/home?capture=1", permanent: false },
      // The record moved to /rhythm; /history kept only the account settings.
      { source: "/history", destination: "/you", permanent: false },
    ];
  },
};

export default nextConfig;
