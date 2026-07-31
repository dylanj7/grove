import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Tree } from "@/components/tree";
import { buildGrove, sinceLabel, type TreeDay } from "@/lib/grove-tree";
import { Skeleton } from "@/components/ui";

// ============================================================================
// THE GROVE, ON HOME (§3.8).
// ----------------------------------------------------------------------------
// The tree was the best thing in the app and it lived on a tab nobody had a
// reason to open. Here it is compact, under the day's work, doing the one job
// only it can do: showing that this is a long thing you are in the middle of,
// on a screen that otherwise only ever shows today.
//
// WHY IT STREAMS. This costs three queries over the WHOLE record — the tree is
// deliberately the only view in Grove that isn't a fourteen-day window — and
// Home's founding rule is that nothing slow sits on the render path of the
// first paint (see the letter's Suspense boundary). So it arrives behind its
// own boundary, after the letter and the intentions are already usable, and a
// slow read costs a skeleton at the bottom of the page rather than a slow page.
//
// THE RETURN LINE is the other half. Finch's compassionate-tech model is the
// thing users of that app specifically name as why they don't quit, and it is
// one sentence: coming back after a gap must be met with warmth, never with a
// tally of what was missed. Grove can do better than warmth, because for Grove
// it is also literally true — the trunk grows from weeks elapsed, so the tree
// really did keep growing while nobody was looking. That is the whole reason
// lib/grove-tree.ts anchors the trunk to today rather than to the last capture.
// ============================================================================

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The gap is only worth naming once it's long enough to feel like one. */
const GAP_DAYS = 4;

export default async function HomeGrove({ localDay }: { localDay: string }) {
  const supabase = await createClient();
  const uid = await getUserId();
  if (!uid) return null;

  const [{ data: checkinDays }, { data: moveDays }, { data: touchDays }] = await Promise.all([
    supabase
      .from("checkins")
      .select("day, mood")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .limit(800),
    // A day you tended what you said you'd tend is a day on the tree, even with
    // nothing written — the point of making intentions objects.
    supabase
      .from("move_tends")
      .select("day")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .limit(800),
    supabase
      .from("goal_touches")
      .select("day")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .limit(800),
  ]);

  const treeDays: TreeDay[] = [
    ...((checkinDays ?? []) as TreeDay[]),
    ...((moveDays ?? []) as { day: string }[]).map((d) => ({ day: d.day, mood: null })),
    ...((touchDays ?? []) as { day: string }[]).map((d) => ({ day: d.day, mood: null })),
  ];

  // Nothing planted yet: the /grove tab already says this properly, and Home on
  // day one is busy being a first letter. Silence beats a second empty state.
  if (treeDays.length === 0) return null;

  const grove = buildGrove(treeDays, localDay);

  // The newest day anything was set down. Sorted rather than assumed: three
  // queries were merged and only the individual ones came back ordered.
  const lastDay = treeDays.reduce((a, b) => (a.day > b.day ? a : b)).day;
  const gap = daysBetween(lastDay, localDay);

  return (
    <section>
      <Link
        href="/grove"
        className="grove-press-soft flex items-center gap-4 rounded-2xl border border-sage/70 bg-dawn px-4 py-3 shadow-soft hover:bg-bark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
      >
        <Tree shape={grove} className="h-20 w-20 shrink-0" />
        <span className="min-w-0 flex-1">
          {gap >= GAP_DAYS ? (
            <>
              <span className="block text-[0.95rem] leading-snug text-pine">
                {gap} days since the last one.
              </span>
              <span className="mt-1 block text-[0.78rem] leading-relaxed text-canopy">
                The tree kept growing. It grows on time, not on turning up &mdash;
                nothing was lost.
              </span>
            </>
          ) : (
            <>
              <span className="block text-[0.95rem] leading-snug text-pine">
                Your grove
              </span>
              <span className="mt-1 block text-[0.78rem] leading-relaxed text-canopy">
                {grove.firstDay
                  ? `Every day you've set something down, since ${sinceLabel(grove.firstDay)}.`
                  : "Every day you've set something down."}
              </span>
            </>
          )}
        </span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-canopy/60" />
      </Link>
    </section>
  );
}

/** The frame the strip arrives into. Exactly its height, so nothing shifts. */
export function HomeGroveSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-sage/70 bg-dawn px-4 py-3 shadow-soft">
      <Skeleton className="h-20 w-20 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
