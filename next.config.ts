import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The information architecture changed — five tabs collapsed to four
  // destinations plus one action — so every old path is redirected rather than
  // left to 404. These are config redirects, not redirect pages: they're
  // answered before any React renders, so an old bookmark or a PWA shortcut
  // costs a header, not a round-trip through the app shell.
  async redirects() {
    return [
      // /grove and /today were the same screen wearing two hats; they're Home.
      { source: "/grove", destination: "/home", permanent: false },
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
