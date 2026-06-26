import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { toUiKind, DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import AddGoal from "./add-goal";

type Row = {
  id: string;
  title: string;
  aspect: string;
  horizon: string;
  kind: string;
};

function GoalRows({ rows }: { rows: Row[] }) {
  return (
    <ul className="-mx-2">
      {rows.map((g) => (
        <li key={g.id}>
          <Link
            href={`/goals/${g.id}`}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-dawn focus-visible:bg-dawn focus-visible:outline-none"
          >
            <span className="text-[1.02rem] text-pine">{g.title}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
                {DOMAIN_LABEL[g.aspect as Domain] ?? g.aspect}
              </span>
              <ChevronRight size={16} className="text-canopy/70" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// A quiet ledger of living intentions, in two kinds: goals (vectors) and habits
// (rhythms). Not a task app, not checkboxes.
export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, aspect, horizon, kind, status")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .order("aspect", { ascending: true });

  const list = (goals ?? []) as Row[];
  const vectors = list.filter((g) => toUiKind(g.kind) === "goal");
  const rhythms = list.filter((g) => toUiKind(g.kind) === "habit");

  if (list.length === 0) {
    return (
      <Screen className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <Voice className="text-[1.5rem]">Nothing planted yet.</Voice>
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
    <Screen>
      <Eyebrow primary="Goals" secondary="What you're moving toward" />

      <div className="mt-10 space-y-11">
        {vectors.length > 0 ? (
          <section className="space-y-2">
            <Eyebrow primary="Goals" secondary="vectors" />
            <GoalRows rows={vectors} />
          </section>
        ) : null}

        {rhythms.length > 0 ? (
          <section className="space-y-2">
            <Eyebrow primary="Habits" secondary="rhythms" />
            <GoalRows rows={rhythms} />
          </section>
        ) : null}
      </div>

      <div className="mt-12">
        <AddGoal />
      </div>
    </Screen>
  );
}
