import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Supabase client for Server Components, Route Handlers, and Server
// Actions. Wired to Next.js request cookies so the user's session travels with
// each request. Uses the publishable key (not the secret key) so Row Level
// Security still applies on behalf of the signed-in user.
export async function createClient() {
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
}
