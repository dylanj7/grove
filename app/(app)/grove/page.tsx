import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { Tree } from "@/components/tree";
import { currentSlot } from "@/lib/slot";

// The grove — the calm center. You enter and the tree is breathing in open
// space: the day above, one carved line below, one quiet action.
export default async function GrovePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The single most recent brief headline, read directly (we don't generate a
  // brief just by coming home — that's what /today is for).
  const { data: latestBrief } = await supabase
    .from("briefs")
    .select("headline")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hasBrief = Boolean(latestBrief?.headline);

  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const slot = currentSlot(now);

  // treeState is a constant placeholder this phase: a sapling until the grove
  // has its first brief, fuller once it's alive.
  const fullness = hasBrief ? 0.82 : 0.12;

  const line = hasBrief
    ? latestBrief!.headline
    : "Your grove is young. Tend it this evening.";
  const action = hasBrief
    ? { href: "/today", text: "Read today's brief" }
    : { href: "/evening", text: "Begin this evening" };

  return (
    <Screen className="flex min-h-[82dvh] flex-col items-center">
      <Eyebrow primary={weekday} secondary={slot === "morning" ? "Morning" : "Evening"} />

      <div className="flex flex-1 flex-col items-center justify-center gap-9 py-10">
        <Tree
          treeState={{ fullness }}
          className="h-60 w-auto"
          label={hasBrief ? "Your grove" : "Your grove, still a sapling"}
        />
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
