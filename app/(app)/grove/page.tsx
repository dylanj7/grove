import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { Tree } from "@/components/tree";
import { currentSlot } from "@/lib/slot";
import { todayISO } from "@/lib/date";

// The grove — the calm center. You enter and the tree is breathing in open
// space: the day above, one carved line below, one quiet action. The line and
// the tree's fullness reflect how far along the grove is — quiet, tended, or
// alive with a brief — never a metric. The check-in is the front door: until
// this slot's check-in is done, the one action is to do it.
export default async function GrovePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const now = new Date();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  const slot = currentSlot(now);
  const day = todayISO();
  const isMorning = slot === "morning";

  const [{ data: latestBrief }, { data: slotCheckin }] = await Promise.all([
    supabase
      .from("briefs")
      .select("headline, day")
      .eq("user_id", uid)
      .eq("day", day)
      .eq("slot", slot)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checkins")
      .select("day")
      .eq("user_id", uid)
      .eq("day", day)
      .eq("slot", slot)
      .maybeSingle(),
  ]);

  const slotDone = Boolean(slotCheckin);
  const hasBrief = Boolean(latestBrief?.headline);

  // Three honest tiers — fullness is a constant per tier this phase (the seam
  // is the prop, not the value).
  let fullness: number;
  let line: string;
  let action: { href: string; text: string };
  let treeLabel: string;

  if (!slotDone) {
    fullness = 0.16;
    line = isMorning
      ? "A new day. Begin with how you're heading in."
      : "The day winds down. Set down how it went.";
    action = {
      href: "/checkin",
      text: isMorning ? "Begin the morning" : "Tend this evening",
    };
    treeLabel = "Your grove, still a sapling";
  } else if (hasBrief) {
    fullness = 0.82;
    line = latestBrief!.headline;
    action = { href: "/today", text: `Read the ${slot} brief` };
    treeLabel = "Your grove";
  } else {
    fullness = 0.42;
    line = isMorning
      ? "The morning is set. Your brief is forming."
      : "The day is tended. Your brief is forming.";
    action = { href: "/today", text: `Read the ${slot} brief` };
    treeLabel = "Your grove, taking root";
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
