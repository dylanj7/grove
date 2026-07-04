import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import TabBar from "@/components/tab-bar";
import TzCookie from "@/components/tz-cookie";

// The app shell: every authenticated screen renders inside this. The proxy
// already guards these routes; we verify server-side here too as a second line.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Publishes the user's timezone offset to a cookie so Server Components
          (notably /today) render the correct local slot without a round-trip. */}
      <TzCookie />
      {/* Bottom padding clears the fixed tab bar (its height + the safe inset). */}
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
