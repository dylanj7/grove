import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWindow } from "@/lib/window";
import { detectNudges, isCivilHour, pickNudge, COOLDOWN_DAYS } from "@/lib/nudges";
import { pushConfigured, sendPush } from "@/lib/push";
import type { MoveTend } from "@/lib/intentions";

// ============================================================================
// THE SENDER — the only thing in Grove that speaks first.
// ----------------------------------------------------------------------------
// Runs on a schedule and decides, per person, whether the data says anything
// worth an interruption. The SCHEDULE IS NOT THE TRIGGER: every gate that
// matters lives in lib/nudges.ts, so this route is safe to run hourly, daily,
// or twice by accident, and behaves identically. That property is deliberate —
// a promise ("never more than three a week") that depends on a crontab entry
// isn't a promise, it's a configuration.
//
// It reads across accounts, so it uses the admin client and every query carries
// its own user filter. See lib/supabase/admin.ts for why that's a rule and not
// a habit.
//
// Node runtime: web-push signs the VAPID JWT with node:crypto.
// ============================================================================
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many people one run will consider. Grove is small; this exists so the
// function can never run away, not because the number is meaningful.
const BATCH = 200;

type SubRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  tz_offset: number | null;
};

/** The user's local day, from a device offset (local = UTC − offset). */
function localDay(now: Date, tzOffset: number): string {
  return new Date(now.getTime() - tzOffset * 60_000).toISOString().slice(0, 10);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means this endpoint is closed, not open. Vercel Cron
  // sends `Authorization: Bearer $CRON_SECRET` on every invocation, so an
  // unset secret is a misconfiguration — and the safe reading of a
  // misconfigured auth check is "deny".
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, reason: "push_unconfigured" }, { status: 503 });
  }

  const now = new Date();
  const supabase = createAdminClient();

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, tz_offset")
    .order("user_id", { ascending: true })
    .limit(BATCH);

  if (subsError) {
    console.error("nudge run: subscription read failed:", subsError.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Group by person: the decision is per-account (it reads one window), the
  // delivery is per-device.
  const byUser = new Map<string, SubRow[]>();
  for (const s of (subs ?? []) as SubRow[]) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  let considered = 0;
  let sent = 0;
  let pruned = 0;

  for (const [userId, devices] of byUser) {
    // Only devices where it is a decent hour right now. If none qualify, this
    // person is skipped entirely — including the expensive window read, which
    // is the point of checking first.
    const reachable = devices.filter((d) => isCivilHour(now, d.tz_offset));
    if (reachable.length === 0) continue;

    considered++;

    try {
      // The person's own local day, taken from a device that's awake. Every
      // detector reasons in calendar days, so getting this from UTC would put
      // half the world's "yesterday" off by one.
      const today = localDay(now, reachable[0].tz_offset!);

      const since4 = new Date(now.getTime() - 4 * 86_400_000).toISOString().slice(0, 10);
      const sinceSends = new Date(
        now.getTime() - (COOLDOWN_DAYS + 4) * 86_400_000,
      ).toISOString();

      const [win, tendsRes, recentRes] = await Promise.all([
        loadWindow(supabase, userId),
        supabase
          .from("move_tends")
          .select("day, slot, move_key, move_text, aspect, state, created_at")
          .eq("user_id", userId)
          .gte("day", since4)
          .order("day", { ascending: false }),
        // Newest first: pickNudge's per-code lookup takes the first match.
        supabase
          .from("nudge_sends")
          .select("code, signature, sent_at")
          .eq("user_id", userId)
          .gte("sent_at", sinceSends)
          .order("sent_at", { ascending: false }),
      ]);

      const candidates = detectNudges({
        win,
        moveTends: (tendsRes.data ?? []) as MoveTend[],
        today,
      });
      if (candidates.length === 0) continue;

      const nudge = pickNudge({
        candidates,
        recent: recentRes.data ?? [],
        now,
      });
      if (!nudge) continue;

      // Deliver, then record what actually happened. A subscription the push
      // service has retired is deleted here rather than retried forever — that
      // is the normal end of a subscription's life, not an error.
      let delivered = 0;
      for (const device of reachable) {
        const result = await sendPush(device, {
          title: nudge.title,
          body: nudge.body,
          url: nudge.url,
          tag: "grove-nudge",
        });
        if (result === "sent") delivered++;
        if (result === "gone") {
          await supabase.from("push_subscriptions").delete().eq("id", device.id);
          pruned++;
        }
      }

      // Recorded even when delivered is 0. The row is what the cap and the
      // cooldown are counted from, and "we decided to say this" is the fact
      // they're about — retrying a decision because a phone was unreachable is
      // how one silent day turns into three notifications at once.
      const { error: recordError } = await supabase.from("nudge_sends").insert({
        user_id: userId,
        code: nudge.code,
        signature: nudge.signature,
        title: nudge.title,
        body: nudge.body,
        delivered,
      });
      if (recordError) console.error("nudge record failed:", recordError.message);

      if (delivered > 0) sent++;
    } catch (err) {
      // One person's bad window must not stop everyone else's run.
      console.error("nudge run failed for a user:", (err as Error)?.message);
    }
  }

  return NextResponse.json({ ok: true, considered, sent, pruned });
}
