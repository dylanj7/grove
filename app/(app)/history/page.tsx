import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { signOut } from "@/app/auth/actions";

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type DayEntry = { brief?: string; tended?: boolean; note?: string | null };

// The longer view of the user's own tending, plus account controls. A record,
// never a chart or a score — no comparison, not even against their own past.
export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user!.id;

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

          {/* Seams for later phases — clearly "coming", never fake toggles. */}
          {[
            ["Fitbit", "Later"],
            ["Notifications", "Later"],
          ].map(([label, status]) => (
            <div
              key={label}
              aria-disabled
              className="flex items-center justify-between gap-4 opacity-55"
            >
              <dt className="text-[0.7rem] uppercase tracking-[0.16em] text-canopy">
                {label}
              </dt>
              <dd className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
                {status}
              </dd>
            </div>
          ))}
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
