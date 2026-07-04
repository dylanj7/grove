"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "tzoff";
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

// The user's timezone offset, written to a cookie the SERVER can read. The offset
// is the one thing the browser knows for free and the server can't derive — and
// Server Components need it to compute the correct slot and local day (which
// brief to render) without a round-trip. It changes only on travel or DST, so
// this almost always finds the cookie already correct and does nothing.
//
// On the first-ever load the cookie is absent: the server rendered a skeleton,
// so once we set the cookie we refresh() to re-render with the real slot. That
// one refresh is the entire cost of never guessing with server time.
export default function TzCookie() {
  const router = useRouter();

  useEffect(() => {
    const offset = String(new Date().getTimezoneOffset());
    if (readCookie(COOKIE) === offset) return; // already correct — no refresh
    document.cookie = `${COOKIE}=${offset}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
