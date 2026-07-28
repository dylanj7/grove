import { redirect } from "next/navigation";
import { getUserId } from "@/lib/supabase/server";

// Root: signed-in users go home, everyone else to login. The auth read here is
// a local JWT verification, not a round-trip to the auth server — so the very
// first thing that happens when someone opens Grove is no longer a wait.
export default async function RootPage() {
  const uid = await getUserId();
  redirect(uid ? "/home" : "/login");
}
