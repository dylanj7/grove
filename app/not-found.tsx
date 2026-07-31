import Link from "next/link";
import { Screen, Voice } from "@/components/ui";

// A URL that doesn't exist. Grove's information architecture has moved twice —
// five tabs to four destinations, then Goals to Grove — and next.config.ts
// redirects every path either move retired. This is for whatever those don't
// cover: a typo, a stale share, a route that never existed.
//
// It sits at the app root rather than inside (app), so a dead link renders as a
// sentence rather than as an empty app shell with a tab bar under it. Note that
// a SIGNED-OUT visitor never reaches this: proxy.ts protects every non-public
// path and redirects to /login first, which is the correct order — the app
// shouldn't disclose which of its URLs exist to someone who isn't signed in.
export default function NotFound() {
  return (
    <Screen className="flex min-h-[80dvh] flex-col justify-center space-y-5">
      <Voice className="text-[1.5rem] leading-snug">Nothing lives at that path.</Voice>
      <p className="max-w-[20rem] text-[0.95rem] leading-relaxed text-canopy">
        Grove has four places: today&rsquo;s read, your grove, your rhythm, and
        you. This isn&rsquo;t one of them.
      </p>
      <div className="pt-1">
        <Link
          href="/home"
          className="grove-press inline-flex min-h-[48px] items-center rounded-2xl bg-moss px-6 text-[0.74rem] font-medium uppercase tracking-[0.16em] text-mist hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          Take me home
        </Link>
      </div>
    </Screen>
  );
}
