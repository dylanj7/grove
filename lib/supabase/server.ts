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
// lets cache() on downstream reads (see getSessionUser) actually dedup by
// argument identity. Per-request only; each request/route handler gets its own.
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

// The authenticated user, read once per request. auth.getUser() validates the
// session against the Supabase auth server (a real round-trip), and both the app
// layout and the page it wraps need it — so caching collapses those two calls in
// a single render pass into one. Returns null when signed out.
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
