import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient, getUserId } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice, SectionLabel } from "@/components/ui";
import { toUiKind, DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import AddGoal from "./add-goal";

type Row = {
  id: string;
  title: string;
  aspect: string;
  horizon: string;
  kind: string;
};

// ============================================================================
// WHAT YOU'VE PLANTED — no longer a tab, and no longer a second Home.
// ----------------------------------------------------------------------------
// This was the weakest screen in the app for a structural reason: its entire
// contents already appeared on Home. Rhythms Today and Moving Toward were
// duplicated verbatim, so a person tapping "Goals" arrived at a screen they had
// just scrolled past, with a checkbox on it that Home also had.
//
// Home is where you TEND now — one list, one gesture (components/intentions).
// This is where you MANAGE: see everything you've planted, open its record,
// plant something new. It's reached from You, or from a row on Home, and it
// deliberately has no checkbox, because a second place to tick the same box is
// what made it feel like a duplicate in the first place.
// ============================================================================

function Rows({ rows }: { rows: Row[] }) {
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

function BackToYou() {
  return (
    <Link
      href="/you"
      className="grove-press-soft -ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-[0.7rem] font-medium uppercase tracking-[0.14em] text-canopy hover:text-pine focus-visible:outline-none focus-visible:underline"
    >
      <ChevronLeft size={15} aria-hidden />
      You
    </Link>
  );
}

export default async function GoalsPage() {
  const supabase = await createClient();
  const uid = (await getUserId())!;

  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, aspect, horizon, kind, status")
    .eq("user_id", uid)
    .eq("status", "active")
    .order("aspect", { ascending: true })
    .order("title", { ascending: true });

  const list = (goals ?? []) as Row[];
  const vectors = list.filter((g) => toUiKind(g.kind) === "goal");
  const rhythms = list.filter((g) => toUiKind(g.kind) === "habit");

  if (list.length === 0) {
    return (
      <Screen className="space-y-8">
        <BackToYou />
        <div className="space-y-4 pt-8">
          <Voice className="text-[1.5rem]">Nothing planted yet.</Voice>
          <p className="max-w-[20rem] text-[0.95rem] leading-relaxed text-canopy">
            Two kinds of thing live here. A <strong className="font-medium text-pine">rhythm</strong> is
            something you return to, with no finish line. A{" "}
            <strong className="font-medium text-pine">vector</strong> is something you move toward.
            Both show up on Home as things to tend.
          </p>
        </div>
        <AddGoal />
      </Screen>
    );
  }

  return (
    <Screen className="space-y-9">
      <header className="space-y-3">
        <BackToYou />
        <Eyebrow primary="Planted" secondary="rhythms and vectors" />
      </header>

      {rhythms.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel right="no finish line">Rhythms</SectionLabel>
          <Rows rows={rhythms} />
        </section>
      ) : null}

      {vectors.length > 0 ? (
        <section className="space-y-3">
          <SectionLabel>Moving toward</SectionLabel>
          <Rows rows={vectors} />
        </section>
      ) : null}

      <div className="pt-2">
        <AddGoal />
      </div>
    </Screen>
  );
}
