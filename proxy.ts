import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// In Next.js 16 the `middleware` convention was renamed to `proxy`.
// This runs before every matched request: it keeps the Supabase session current
// and enforces route protection.
//
// SPEED: this is the very first thing that runs on every navigation, so what it
// does costs the user directly. It uses getClaims() — a LOCAL WebCrypto
// signature check against this project's asymmetric (ES256) signing key — not
// getUser(), which waits on a round-trip to the auth server. Next.js's own docs
// are explicit that proxy "is not intended for slow data fetching" and should be
// used for optimistic checks only; the real authorization boundary is Postgres
// RLS plus the per-screen check in the app layout, both of which still hold.
// getClaims() still refreshes an about-to-expire session (writing the refreshed
// cookies through setAll below), so the session stays live exactly as before.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // These headers prevent CDNs/proxies from caching responses that
          // carry refreshed auth cookies.
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value)
            );
          }
        },
      },
    }
  );

  // Called right away so any token refresh is written back to the response
  // cookies before we generate a redirect.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    // The nudge sender (Phase 8). Vercel Cron calls it with no session — it
    // carries no cookies at all — so protecting it here would mean the proxy
    // 307ing every scheduled run to /login and notifications silently never
    // working. It is NOT unauthenticated: it checks
    // `Authorization: Bearer $CRON_SECRET` itself and returns 401 to everyone
    // when that variable is unset, which is the safe failure direction.
    pathname === "/api/nudges/run";

  // Unauthenticated users hitting a protected route → /login
  if (!signedIn && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return copyCookies(response, NextResponse.redirect(url));
  }

  // Authenticated users hitting /login → home
  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return copyCookies(response, NextResponse.redirect(url));
  }

  return response;
}

// Carry the refreshed session cookies over to a redirect response so the
// session is not dropped when we redirect.
function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export const config = {
  matcher: [
    // Run on everything except Next.js internals and static asset files.
    //
    // sw.js and manifest.webmanifest are excluded for a reason worth stating:
    // both are fetched by the BROWSER ITSELF rather than by the app, and both
    // were being 307'd to /login before this. A service worker that redirects
    // cannot be registered at all, which quietly makes every notification in
    // Phase 8 impossible; a manifest that redirects means the install prompt
    // never appears, which quietly makes Grove un-installable — and on iOS,
    // un-installable means Web Push is unavailable too. Neither discloses
    // anything: one is a static file every visitor may read, the other
    // describes the app's name and icons.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
