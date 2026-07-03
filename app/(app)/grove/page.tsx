import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { Tree } from "@/components/tree";
import { currentSlot } from "@/lib/slot";
import { todayISO } from "@/lib/date";
import { groveFullness, groveLabel, type DayTier } from "@/lib/tree-state";

const WINDOW_DAYS = 14;

// The grove — the calm center. You enter and the tree is breathing in open
// space: the day above, one carved line below, one quiet action. The tree is
// now truly alive: its canopy carries the last fourteen days of actual tending
// (slow, drifting, never a metric — see lib/tree-state.ts), with today's small
// arc layered on top. The check-in is the front door: until this slot's
// check-in is done, the one action is to do it.
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

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));
  const sinceDay = since.toISOString().slice(0, 10);

  const [{ data: latestBrief }, { data: slotCheckin }, { data: checkinDays }, { data: touchDays }] =
    await Promise.all([
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
      // The slow mass of the canopy: which of the last fourteen days received
      // any care at all. Distinct days only — care counts, intensity doesn't.
      supabase.from("checkins").select("day").eq("user_id", uid).gte("day", sinceDay),
      supabase.from("goal_touches").select("day").eq("user_id", uid).gte("day", sinceDay),
    ]);

  const slotDone = Boolean(slotCheckin);
  const hasBrief = Boolean(latestBrief?.headline);

  const tendedDays = new Set<string>([
    ...(checkinDays ?? []).map((r) => r.day as string),
    ...(touchDays ?? []).map((r) => r.day as string),
  ]);

  // Today's tier still shapes the line and the one action; the tree's form is
  // now the window's slow truth plus this small daily arc.
  let tier: DayTier;
  let line: string;
  let action: { href: string; text: string };

  if (!slotDone) {
    tier = "quiet";
    line = isMorning
      ? "A new day. Begin with how you're heading in."
      : "The day winds down. Set down how it went.";
    action = {
      href: "/checkin",
      text: isMorning ? "Begin the morning" : "Tend this evening",
    };
  } else if (hasBrief) {
    tier = "brief";
    line = latestBrief!.headline;
    action = { href: "/today", text: `Read the ${slot} brief` };
  } else {
    tier = "tended";
    line = isMorning
      ? "The morning is set. Your brief is forming."
      : "The day is tended. Your brief is forming.";
    action = { href: "/today", text: `Read the ${slot} brief` };
  }

  const fullness = groveFullness({
    daysTended: tendedDays.size,
    windowDays: WINDOW_DAYS,
    todayTier: tier,
  });
  const treeLabel = groveLabel(fullness);

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
