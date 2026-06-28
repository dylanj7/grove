import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { signOut } from "@/app/auth/actions";
import { connectionState, googleConfigured } from "@/lib/health";

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type DayEntry = { brief?: string; tended?: boolean; note?: string | null };

// A calm, honest line for each return-from-OAuth outcome (the ?health= param).
// Never shouts; never strands the user. The "blocked" copy names the usual cause
// (the connecting account isn't on the OAuth test-user list for the Restricted
// scopes) without technical noise.
const HEALTH_NOTE: Record<string, string> = {
  connected: "Fitbit connected. Last night's body flows in from here.",
  disconnected: "Fitbit disconnected. Back to entering the body by hand.",
  refreshed: "Pulled the latest from Fitbit.",
  reconnect: "Fitbit needs reconnecting to keep reading.",
  denied: "No change — the connection was cancelled.",
  blocked:
    "Google blocked the connection. This account likely isn't on the app's test-user list yet — that's the usual cause while the band is in testing.",
  unconfigured: "Connecting a band isn't available here yet.",
  error: "That didn't go through. Nothing changed — try again in a moment.",
};

// The longer view of the user's own tending, plus account controls. A record,
// never a chart or a score — no comparison, not even against their own past.
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

  const healthParam = (await searchParams).health;
  const healthNote = healthParam ? HEALTH_NOTE[healthParam] : undefined;
  const health = googleConfigured()
    ? await connectionState(supabase, uid)
    : "unconfigured";

  const [{ data: profile }, { data: checkins }, { data: briefs }] =
    await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
      supabase
        .from("checkins")
        .select("day, note_text")
        .eq("user_id", uid)
        .order("day", { ascending: false })
        .limit(30),
      supabase
        .from("briefs")
        .select("day, headline")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const byDay = new Map<string, DayEntry>();
  for (const b of briefs ?? []) {
    const e = byDay.get(b.day) ?? {};
    if (!e.brief) e.brief = b.headline; // latest headline for the day
    byDay.set(b.day, e);
  }
  for (const c of checkins ?? []) {
    const e = byDay.get(c.day) ?? {};
    e.tended = true;
    e.note = c.note_text;
    byDay.set(c.day, e);
  }
  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const displayName = profile?.display_name?.trim();

  return (
    <Screen>
      <Eyebrow primary="You" secondary="Your tending" />

      {days.length === 0 ? (
        <Voice className="mt-12 text-[1.4rem]">
          Your grove is young. Its record begins this evening.
        </Voice>
      ) : (
        <ul className="mt-10 space-y-9">
          {days.map(([day, entry]) => (
            <li key={day} className="space-y-2">
              <Eyebrow primary={formatDay(day)} />
              {entry.brief ? (
                <Voice className="text-left text-[1.05rem] text-pine">
                  {entry.brief}
                </Voice>
              ) : null}
              {entry.tended ? (
                entry.note?.trim() ? (
                  <p className="font-voice text-[1.02rem] leading-snug text-soil">
                    &ldquo;{entry.note.trim()}&rdquo;
                  </p>
                ) : (
                  <p className="text-[0.65rem] uppercase tracking-[0.16em] text-canopy">
                    Tended
                  </p>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ---- Account ---- */}
      <section className="mt-16 border-t border-sage pt-9">
        <Eyebrow primary="Account" />

        <dl className="mt-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">
              Name
            </dt>
            <dd className="text-[0.95rem] text-pine">
              {displayName || "—"}
            </dd>
          </div>

          {/* Fitbit — a real, quiet control now. Connecting is optional and
              never celebrated; Grove works fully without it. (Auth is via
              Google, but the user knows it as their Fitbit.) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">
                Fitbit
              </dt>
              <dd className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
                {health === "connected"
                  ? "Connected"
                  : health === "needs_reconnect"
                    ? "Reconnect"
                    : health === "unconfigured"
                      ? "Later"
                      : "Not connected"}
              </dd>
            </div>

            {health === "connected" ? (
              <div className="flex items-center gap-5">
                <form action="/api/health/refresh" method="post">
                  <button
                    type="submit"
                    className="min-h-[44px] py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
                  >
                    Refresh now
                  </button>
                </form>
                <form action="/api/health/disconnect" method="post">
                  <button
                    type="submit"
                    className="min-h-[44px] py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-canopy transition-colors hover:text-soil focus-visible:outline-none focus-visible:underline"
                  >
                    Disconnect
                  </button>
                </form>
              </div>
            ) : health === "unconfigured" ? null : (
              <a
                href="/api/health/connect"
                className="inline-flex min-h-[44px] items-center py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
              >
                {health === "needs_reconnect" ? "Reconnect Fitbit" : "Connect Fitbit"}
              </a>
            )}

            {health === "connected" ? (
              <p className="text-[0.72rem] leading-relaxed text-canopy/80">
                Disconnecting removes the band&rsquo;s readings; anything you
                entered by hand stays.
              </p>
            ) : null}

            {healthNote ? (
              <p className="text-[0.78rem] leading-relaxed text-soil">
                {healthNote}
              </p>
            ) : null}
          </div>

          {/* Notifications — still a later-phase seam, honestly disabled. */}
          <div
            aria-disabled
            className="flex items-center justify-between gap-4 opacity-55"
          >
            <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">
              Notifications
            </dt>
            <dd className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
              Later
            </dd>
          </div>
        </dl>

        <form action={signOut} className="mt-10">
          <button
            type="submit"
            className="min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-moss transition-colors hover:text-pine focus-visible:outline-none focus-visible:underline"
          >
            Sign out
          </button>
        </form>
      </section>
    </Screen>
  );
}
