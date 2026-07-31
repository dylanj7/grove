import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// THE ONE CLIENT THAT IS NOT THE USER.
//
// Everywhere else in Grove, Supabase is reached as the signed-in person and RLS
// is the real boundary (see ./server.ts). This client holds the secret key and
// therefore bypasses RLS entirely, which makes it the single most dangerous
// object in the codebase — so it exists for exactly one caller: the nudge
// sender, which runs on a cron with no user attached and must be able to read
// across accounts to decide who, if anyone, has something worth being
// interrupted for.
//
// RULES, and they are not stylistic:
//   • Never import this from a Server Component, a Server Action, or any route
//     that a signed-in user can reach. If a request has a user, use their
//     client — a route that escalates privilege to touch rows the caller
//     already owns only has to be wrong once.
//   • Every query made through it MUST carry its own .eq("user_id", …). There
//     is no policy underneath to catch a forgotten filter.
//   • It is only ever constructed inside a function. A module-level instance
//     would throw at import time in any environment without the secret — which
//     includes the browser bundle, where the mere possibility of this file
//     being reachable is the failure.
// ---------------------------------------------------------------------------
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("createAdminClient: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing");
  }

  return createSupabaseClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
