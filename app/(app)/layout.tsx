import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TabBar from "@/components/tab-bar";

// The app shell: every authenticated screen renders inside this. The proxy
// already guards these routes; we verify server-side here too as a second line.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Bottom padding clears the fixed tab bar (its height + the safe inset). */}
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
