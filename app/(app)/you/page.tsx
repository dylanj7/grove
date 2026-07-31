import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { Screen, Eyebrow, SectionLabel, Card } from "@/components/ui";
import ThemeToggle from "@/components/theme-toggle";
import NotificationSetting from "@/components/notification-setting";
import { signOut } from "@/app/auth/actions";
import { connectionState, googleConfigured } from "@/lib/health";
import { vapidPublicKey } from "@/lib/push";

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A calm, honest line for each return-from-OAuth outcome (the ?health= param).
// Never shouts; never strands the user. The "blocked" copy names the usual cause
// (the connecting account isn't on the OAuth test-user list for the Restricted
// scopes) without technical noise.
const HEALTH_NOTE: Record<string, string> = {
  connected: "Band connected. Last night's body flows in from here.",
  disconnected: "Band disconnected. Back to entering the body by hand.",
  refreshed: "Pulled the latest from your band.",
  reconnect: "Your band needs reconnecting to keep reading.",
  denied: "No change — the connection was cancelled.",
  blocked:
    "Google blocked the connection. This account likely isn't on the app's test-user list yet — that's the usual cause while the band is in testing.",
  unconfigured: "Connecting a band isn't available here yet.",
  error: "That didn't go through. Nothing changed — try again in a moment.",
};

// YOU — the account screen, and only that.
//
// It used to be the "You" tab, which meant it was BOTH the entire record of the
// user's tending AND their settings, in one scroll: thirty days of headlines
// followed, eventually, by a sign-out button. The record moved to /rhythm where
// it can be looked at properly, and this became what it always wanted to be —
// a short, quiet settings screen you visit rarely.
export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ health?: string }>;
}) {
  const supabase = await createClient();
  const user = (await getSessionUser())!;
  const uid = user.id;

  const healthParam = (await searchParams).health;
  const healthNote = healthParam ? HEALTH_NOTE[healthParam] : undefined;
  const health = googleConfigured()
    ? await connectionState(supabase, uid)
    : "unconfigured";

  // The quiet proof the band is flowing: the day of its newest reading. A date,
  // not a dashboard — enough to answer "is it working?" without opening a chart.
  let latestBandDay: string | null = null;
  if (health === "connected") {
    const { data: latestBand } = await supabase
      .from("physical_days")
      .select("day")
      .eq("user_id", uid)
      .eq("source", "google_health")
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestBandDay = latestBand?.day ?? null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", uid)
    .maybeSingle();

  const displayName = profile?.display_name?.trim();

  return (
    <Screen className="space-y-9">
      <header className="pt-1">
        <Eyebrow primary="You" secondary="Account" />
      </header>

      {/* Rhythms and vectors are tended on Home, in one list, alongside the
          letter's own intentions. Managing them — planting, opening a record —
          used to be a whole tab that duplicated Home; it's a screen you visit
          rarely, reached from here. */}
      <section className="space-y-3">
        <SectionLabel>Intentions</SectionLabel>
        <Link
          href="/goals"
          className="grove-press-soft flex min-h-[52px] items-center justify-between gap-3 rounded-2xl border border-sage/70 bg-dawn px-5 py-4 shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/40"
        >
          <span className="min-w-0">
            <span className="block text-[0.95rem] text-pine">What you&rsquo;ve planted</span>
            <span className="mt-0.5 block text-[0.76rem] leading-snug text-canopy">
              Your rhythms and what you&rsquo;re moving toward.
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-canopy/60" aria-hidden />
        </Link>
      </section>

      <section className="space-y-3">
        <SectionLabel>Appearance</SectionLabel>
        <ThemeToggle />
      </section>

      {/* The public half of the VAPID pair is read here and handed down, so the
          client needs no NEXT_PUBLIC_ env var to subscribe — and a deployment
          without keys renders an honest "not set up yet" rather than a button
          that fails. */}
      <section className="space-y-3">
        <SectionLabel>Notifications</SectionLabel>
        <Card>
          <NotificationSetting vapidPublicKey={vapidPublicKey()} />
        </Card>
      </section>

      <section className="space-y-3">
        <SectionLabel>Band</SectionLabel>
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[0.95rem] text-pine">
              {health === "connected"
                ? "Connected"
                : health === "needs_reconnect"
                  ? "Needs reconnecting"
                  : health === "unconfigured"
                    ? "Not available yet"
                    : "Not connected"}
            </span>
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                health === "connected"
                  ? "bg-viz-body"
                  : health === "needs_reconnect"
                    ? "bg-ember"
                    : "bg-sage"
              }`}
            />
          </div>

          {health === "connected" ? (
            <div className="flex items-center gap-5">
              <form action="/api/health/refresh" method="post">
                <button
                  type="submit"
                  className="grove-press min-h-[40px] py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-moss hover:text-pine focus-visible:outline-none focus-visible:underline"
                >
                  Refresh now
                </button>
              </form>
              <form action="/api/health/disconnect" method="post">
                <button
                  type="submit"
                  className="grove-press min-h-[40px] py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-canopy hover:text-soil focus-visible:outline-none focus-visible:underline"
                >
                  Disconnect
                </button>
              </form>
            </div>
          ) : health === "unconfigured" ? null : (
            <a
              href="/api/health/connect"
              className="grove-press inline-flex min-h-[40px] items-center text-[0.68rem] font-medium uppercase tracking-[0.14em] text-moss hover:text-pine focus-visible:outline-none focus-visible:underline"
            >
              {health === "needs_reconnect" ? "Reconnect band" : "Connect a band"}
            </a>
          )}

          {health === "connected" && latestBandDay ? (
            <p className="text-[0.75rem] leading-relaxed text-canopy">
              Latest reading · {formatDay(latestBandDay)}
            </p>
          ) : null}

          {health === "connected" ? (
            <p className="text-[0.75rem] leading-relaxed text-canopy">
              Disconnecting stops new syncing; your history stays.
            </p>
          ) : null}

          {healthNote ? (
            <p className="text-[0.8rem] leading-relaxed text-soil">{healthNote}</p>
          ) : null}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionLabel>Account</SectionLabel>
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[0.7rem] uppercase tracking-[0.14em] text-canopy">
              Name
            </span>
            <span className="text-[0.95rem] text-pine">{displayName || "—"}</span>
          </div>
          {user.email ? (
            <div className="flex items-center justify-between gap-4">
              <span className="text-[0.7rem] uppercase tracking-[0.14em] text-canopy">
                Email
              </span>
              <span className="truncate text-[0.95rem] text-pine">{user.email}</span>
            </div>
          ) : null}
        </Card>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="grove-press min-h-[44px] py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy hover:text-ember focus-visible:outline-none focus-visible:underline"
        >
          Sign out
        </button>
      </form>
    </Screen>
  );
}
