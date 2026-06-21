import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client for use inside Client Components.
// Uses the publishable key, which is safe to expose to the browser.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
