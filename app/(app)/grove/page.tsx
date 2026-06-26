import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { Tree } from "@/components/tree";
import { currentSlot } from "@/lib/slot";

// The grove — the calm center. You enter and the tree is breathing in open
// space: the day above, one carved line below, one quiet action. The line and
// the tree's fullness reflect how far along the grove is — quiet, tended, or
// alive with a brief — never a metric.
export default async function GrovePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: latestBrief }, { data: latestCheckin }] = await Promise.all([
    supabase
      .from("briefs")
      .select("headline")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checkins")
      .select("day")
      .eq("user_id", uid)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const hasBrief = Boolean(latestBrief?.headline);
  const hasCheckin = Boolean(latestCheckin);

  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const slot = currentSlot(now);

  // Three honest tiers — fullness is a constant per tier this phase (the seam
  // is the prop, not the value).
  let fullness: number;
  let line: string;
  let action: { href: string; text: string };
  let treeLabel: string;

  if (hasBrief) {
    fullness = 0.82;
    line = latestBrief!.headline;
    action = { href: "/today", text: "Read today's brief" };
    treeLabel = "Your grove";
  } else if (hasCheckin) {
    fullness = 0.42;
    line = "The day is tended. Tomorrow's grove will have something to say.";
    action = { href: "/today", text: "Read today's brief" };
    treeLabel = "Your grove, taking root";
  } else {
    fullness = 0.12;
    line = "The grove is quiet. Tend it this evening.";
    action = { href: "/evening", text: "Begin this evening" };
    treeLabel = "Your grove, still a sapling";
  }

  return (
    <Screen className="flex min-h-[82dvh] flex-col items-center">
      <Eyebrow
        primary={weekday}
        secondary={slot === "morning" ? "Morning" : "Evening"}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-9 py-10">
        <Tree treeState={{ fullness }} className="h-60 w-auto" label={treeLabel} />
        <Voice className="max-w-[18rem] text-[1.35rem]">{line}</Voice>
      </div>

      <Link
        href={action.href}
        className="mb-2 inline-block min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
      >
        {action.text}
      </Link>
    </Screen>
  );
}
