"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Screen, Voice } from "@/components/ui";

// WHEN A SCREEN DOESN'T COME BACK.
//
// Grove had no error boundary at all, which meant any throw inside a route
// segment fell through to Next's default — a blank page with a stack trace in
// development and an unstyled apology in production. On a product whose entire
// proposition is that it only ever tells you true things, "Application error: a
// client-side exception has occurred" is the single worst sentence it could
// say, because it reads as the app having no idea what just happened.
//
// So the failure speaks in the app's own register, states what is and isn't
// lost, and offers the one action that usually works. It never blames the
// person and never invents a cause it doesn't know.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on this failure in production logs.
    console.error("screen failed:", error.digest ?? "", error);
  }, [error]);

  return (
    <Screen className="flex min-h-[70dvh] flex-col justify-center space-y-5">
      <Voice className="text-[1.5rem] leading-snug">
        That screen didn&rsquo;t come back.
      </Voice>
      <p className="max-w-[20rem] text-[0.95rem] leading-relaxed text-canopy">
        Nothing you&rsquo;ve set down is affected — this is Grove failing to
        read, not failing to keep. Try it again, and if it keeps happening the
        rest of the app still works.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={reset}
          className="grove-press min-h-[48px] rounded-2xl bg-moss px-6 text-[0.74rem] font-medium uppercase tracking-[0.16em] text-mist hover:bg-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="grove-press min-h-[48px] rounded-2xl border border-sage px-5 text-[0.74rem] font-medium uppercase tracking-[0.16em] leading-[48px] text-canopy hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          Home
        </Link>
      </div>
    </Screen>
  );
}
