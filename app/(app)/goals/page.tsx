import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";

const ASPECTS = [
  { key: "physical", label: "Body" },
  { key: "mental", label: "Mind" },
  { key: "work", label: "Work" },
] as const;

function metaLabel(kind: string, horizon: string): string {
  const k = kind === "milestone" ? "Milestone" : "Habit";
  const h = horizon === "short" ? "Short" : "Long";
  return `${k} · ${h}`;
}

// A quiet ledger of living intentions — not a task app, not checkboxes.
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

  const list = goals ?? [];

  if (list.length === 0) {
    return (
      <Screen className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <Voice className="text-[1.5rem]">Nothing planted yet.</Voice>
        <p className="mt-4 max-w-[18rem] text-sm leading-6 text-canopy">
          Your intentions will live here — across body, mind, and work.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <Eyebrow primary="Goals" secondary="What you're moving toward" />

      <div className="mt-10 space-y-10">
        {ASPECTS.map(({ key, label }) => {
          const rows = list.filter((g) => g.aspect === key);
          if (rows.length === 0) return null;
          return (
            <section key={key} className="space-y-2">
              <Eyebrow primary={label} />
              <ul className="-mx-2">
                {rows.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/goals/${g.id}`}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-dawn focus-visible:outline-none focus-visible:bg-dawn"
                    >
                      <span className="text-[1.02rem] text-pine">{g.title}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-[0.65rem] uppercase tracking-[0.14em] text-canopy">
                          {metaLabel(g.kind, g.horizon)}
                        </span>
                        <ChevronRight size={16} className="text-canopy/70" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Screen>
  );
}
