import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient, getUserId } from "@/lib/supabase/server";
import { localDayFromOffset, parseTzOffset, todayISO } from "@/lib/date";
import TreePreview from "@/components/tree-preview";
import Welcome from "./welcome";
import { WELCOMED_COOKIE } from "@/lib/onboarding";

// Setup lives OUTSIDE the (app) group, so it renders with no tab bar. A person
// who has not yet been anywhere shouldn't be looking at four destinations they
// have no reason to visit — and the one thing this screen must not do is offer
// an exit into an empty app.
//
// It is also the only authenticated screen outside that group, so the auth
// check the app layout normally performs is done here directly.
export default async function WelcomePage() {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  const jar = await cookies();

  // Already done? Straight through. Checked here as well as at the root
  // redirect because /welcome is a URL someone can simply type, and re-running
  // setup would re-plant their vector and their rhythm as duplicates.
  if (jar.get(WELCOMED_COOKIE)?.value === "1") redirect("/home");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", uid)
    .maybeSingle();
  if (profile?.onboarded_at) redirect("/home");

  // The preview is rendered on the SERVER and passed down as a prop: it is
  // three <Tree> SVGs built by the same pure functions the rest of the app
  // uses, and none of that needs to reach the browser as JavaScript.
  const offset = parseTzOffset(jar.get("tzoff")?.value);
  const today = offset === null ? todayISO() : localDayFromOffset(offset);

  return <Welcome preview={<TreePreview today={today} />} />;
}
