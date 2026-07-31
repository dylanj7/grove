import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/supabase/server";
import TabBar from "@/components/tab-bar";
import TzCookie from "@/components/tz-cookie";
import CaptureProvider from "@/components/capture-provider";
import OfflineNote from "@/components/offline-note";

// The app shell: every authenticated screen renders inside this.
//
// The auth check here is now a LOCAL JWT verification (see lib/supabase/server),
// not a round-trip to the auth server — and it's deduped with the one the page
// itself does, so a navigation costs zero auth network calls instead of the
// three it used to. The proxy's check stays as the optimistic first line;
// Postgres RLS remains the real boundary.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await getUserId();
  if (!uid) redirect("/login");

  return (
    // CaptureProvider reads search params, so it needs a Suspense boundary to
    // avoid opting the whole shell out of static rendering.
    <Suspense fallback={null}>
      <CaptureProvider>
        {/* THE DESKTOP CASE (§5.7). Grove is a phone app, but the deploy is a
            URL — so the first time anyone is shown it, they open it on a
            laptop. Left alone, that meant a 448px column of text stranded in
            the middle of a white page with a full-width footer nav across the
            bottom: a mobile site someone forgot to finish, which is the wrong
            first impression of the one thing this product has going for it.
            From md up the column is framed against a softer ground so it reads
            as what it is — an app, shown at its real size. Below md nothing
            changes at all. */}
        <div className="min-h-dvh md:bg-bark">
          <div className="mx-auto flex min-h-dvh w-full flex-col bg-mist md:max-w-md md:border-x md:border-sage/60 md:shadow-lift">
            {/* Publishes the user's timezone offset to a cookie so Server
                Components render the correct local slot without a round-trip. */}
            <TzCookie />
            {/* Bottom padding clears the fixed tab bar (its height + safe inset). */}
            <main className="flex-1 pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
              {/* Only the content animates between routes (Screen carries
                  .grove-enter). The tab bar sits outside this element on
                  purpose: it is the one thing on screen that must read as fixed
                  furniture, and animating it between routes is what makes an
                  app feel like a website reloading. */}
              {children}
            </main>
            <OfflineNote />
            <TabBar />
          </div>
        </div>

        {/* Said once, on the ground beside the frame, only where there is
            genuinely room for it (the column is 28rem; below lg this would
            crowd it). It is the honest version of the "get it on your phone"
            landing the spec offers as the alternative — without hiding the app
            from someone who is standing right in front of it. */}
        <p className="pointer-events-none fixed bottom-8 left-8 z-10 hidden max-w-[13rem] text-[0.78rem] leading-relaxed text-canopy lg:block">
          Grove is made for a phone. Open it there and add it to your Home
          Screen &mdash; that&rsquo;s where the notifications and the morning
          letter actually land.
        </p>
      </CaptureProvider>
    </Suspense>
  );
}
