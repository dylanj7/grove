import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client for Server Components, Route Handlers, and Server
// Actions. Wired to Next.js request cookies so the user's session travels with
// each request. Uses the publishable key (not the secret key) so Row Level
// Security still applies on behalf of the signed-in user.
//
// Wrapped in React cache() so ONE client is shared across a single request's
// render (layout + page + their reads). That both saves re-reading cookies per
// call site and — because the client instance is now stable within a request —
// lets cache() on downstream reads (see getUserId) actually dedup by argument
// identity. Per-request only; each request/route handler gets its own.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. This is safe to ignore: the proxy refreshes the
            // session and writes cookies on every request.
          }
        },
      },
    }
  );
});

// ---------------------------------------------------------------------------
// THE AUTH READ — the single hottest path in the app.
//
// Every screen needs "who is this?" before it can read a row. The obvious call,
// auth.getUser(), sends a request to the Supabase auth server and waits for it
// — and it was being made THREE times per navigation (proxy, layout, page). On
// a phone that was most of the time-to-first-byte, on every single tap, before
// a single row was read.
//
// getClaims() verifies the access token's signature LOCALLY with WebCrypto
// instead. This project signs its JWTs with an asymmetric key (ES256, see
// /auth/v1/.well-known/jwks.json), so verification is a local elliptic-curve
// check against a JWKS that supabase-js fetches once and caches — no network
// round-trip on the common path, and cryptographically just as trustworthy as
// asking the server. (Near token expiry it will refresh the session first; that
// is the rare path, not the per-tap one.)
//
// cache() collapses the layout's check and the page's read into one call per
// render pass. Returns null when signed out.
// ---------------------------------------------------------------------------
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});

// The full user object, for the rare screen that needs more than the id (e.g.
// the email on the account screen). Still a local verification — the claims
// carry email and metadata — so this is not the expensive call it looks like.
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims;
  return {
    id: c.sub,
    email: typeof c.email === "string" ? c.email : null,
  };
});
