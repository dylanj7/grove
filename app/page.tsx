import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { WELCOMED_COOKIE } from "@/lib/onboarding";

// Root: signed-in users go home, everyone else to login. The auth read here is
// a local JWT verification, not a round-trip to the auth server — so the very
// first thing that happens when someone opens Grove is no longer a wait.
//
// THE ONBOARDING GATE LIVES HERE, and nowhere else. It is the natural place:
// every sign-in lands on "/" (proxy.ts sends an authenticated visit to /login
// straight here), so a new account passes through this redirect exactly once,
// before it has seen anything.
//
// The alternative — checking in app/(app)/layout.tsx — would put a profile read
// on the critical path of EVERY navigation, forever, to answer a question whose
// answer changes once in an account's lifetime. That is the same trade the auth
// read was rewritten to stop making. A cookie carries the answer after the
// first time, so the query below runs once per device and then never again.
export default async function RootPage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const jar = await cookies();
  if (jar.get(WELCOMED_COOKIE)?.value === "1") redirect("/home");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", uid)
    .maybeSingle();

  // No profile row and no flag means a genuinely new account. An existing user
  // on a new device has the column set and simply passes through — they are not
  // dragged back through setup because they cleared their cookies.
  redirect(profile?.onboarded_at ? "/home" : "/welcome");
}
