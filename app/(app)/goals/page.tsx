import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel } from "@/components/ui";
import { toUiKind, DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import AddGoal from "./add-goal";
import TendRow from "@/components/tend-row";

type Row = {
  id: string;
  title: string;
  aspect: string;
  horizon: string;
  kind: string;
};

// Goals: a quiet row that taps through to the record. No checkbox — a goal is
// tended on its detail page, not completed from the list.
function GoalRows({ rows }: { rows: Row[] }) {
  return (
    <ul className="-mx-2">
      {rows.map((g) => (
        <li key={g.id}>
          <Link
            href={`/goals/${g.id}`}
            className="grove-press-soft flex min-h-[48px] items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
          >
            <span className="text-[1.02rem] text-pine">{g.title}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-[0.62rem] uppercase tracking-[0.14em] text-canopy/80">
                {DOMAIN_LABEL[g.aspect as Domain] ?? g.aspect}
              </span>
              <ChevronRight size={16} className="text-canopy/60" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function GoalsPage() {
  const supabase = await createClient();
  const uid = (await getUserId())!;

  // Recent touch days (a small window covers "today" in any timezone) so each
  // habit knows whether it's done today. Computed against local day in the row.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 3);
  const sinceDay = since.toISOString().slice(0, 10);

  const [{ data: goals }, { data: touches }] = await Promise.all([
    supabase
      .from("goals")
      .select("id, title, aspect, horizon, kind, status")
      .eq("user_id", uid)
      .eq("status", "active")
      .order("aspect", { ascending: true }),
    supabase
      .from("goal_touches")
      .select("goal_id, day")
      .eq("user_id", uid)
      .gte("day", sinceDay),
  ]);

  const list = (goals ?? []) as Row[];
  const vectors = list.filter((g) => toUiKind(g.kind) === "goal");
  const rhythms = list.filter((g) => toUiKind(g.kind) === "habit");

  const recentByGoal = new Map<string, string[]>();
  for (const t of touches ?? []) {
    const arr = recentByGoal.get(t.goal_id) ?? [];
    arr.push(t.day);
    recentByGoal.set(t.goal_id, arr);
  }

  if (list.length === 0) {
    return (
      <Screen className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <Voice className="text-center text-[1.5rem]">Nothing planted yet.</Voice>
        <p className="mt-4 max-w-[18rem] text-sm leading-6 text-canopy">
          Your intentions will live here — what you&rsquo;re moving toward, and the
          rhythms you keep.
        </p>
        <div className="mt-9">
          <AddGoal />
        </div>
      </Screen>
    );
  }

  return (
    <Screen className="grove-stagger space-y-9">
      <header className="pt-1">
        <Eyebrow primary="Goals" secondary="What you're moving toward" />
      </header>

      {rhythms.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel right="today">Rhythms</SectionLabel>
          <ul className="-mx-2">
            {rhythms.map((h) => (
              <TendRow
                key={h.id}
                id={h.id}
                title={h.title}
                aspect={h.aspect}
                recentDays={recentByGoal.get(h.id) ?? []}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {vectors.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Moving toward</SectionLabel>
          <GoalRows rows={vectors} />
        </section>
      ) : null}

      <div className="pt-2">
        <AddGoal />
      </div>
    </Screen>
  );
}
