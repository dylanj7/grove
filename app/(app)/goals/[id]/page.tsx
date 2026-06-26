import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { toUiKind, DOMAIN_LABEL, type Domain } from "@/lib/goal-kind";
import TendControl from "./tend-control";

type Touch = { day: string; note: string | null };

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function TouchRow({ touch }: { touch: Touch }) {
  return (
    <li className="flex gap-4 py-3">
      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
      <div className="space-y-1">
        <span className="text-[0.95rem] text-pine">{formatDay(touch.day)}</span>
        {touch.note?.trim() ? (
          <p className="font-voice text-[1rem] leading-snug text-soil">
            &ldquo;{touch.note.trim()}&rdquo;
          </p>
        ) : null}
      </div>
    </li>
  );
}

// A single intention, given room — kind-aware. A goal's touches read as a
// timeline toward its horizon; a habit's read as an honest record of when it
// was tended: uncounted, no chain, no streak.
export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: goal } = await supabase
    .from("goals")
    .select("id, title, aspect, horizon, kind")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!goal) notFound();

  const { data: touchData } = await supabase
    .from("goal_touches")
    .select("day, note")
    .eq("user_id", user!.id)
    .eq("goal_id", id)
    .order("day", { ascending: false });

  const kind = toUiKind(goal.kind);
  const allTouches = (touchData ?? []) as Touch[];

  // Goal: every progress moment, in order. Habit: the days tended, deduped to a
  // record of *when* — never a count.
  let touches = allTouches;
  if (kind === "habit") {
    const seen = new Set<string>();
    touches = allTouches.filter((t) => {
      if (seen.has(t.day)) return false;
      seen.add(t.day);
      return true;
    });
  }

  const horizonLabel =
    kind === "goal"
      ? goal.horizon === "short"
        ? "Short horizon"
        : "Long horizon"
      : undefined;

  return (
    <Screen>
      <Link
        href="/goals"
        className="-ml-1 inline-flex min-h-[44px] items-center gap-1.5 py-2 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-canopy transition-colors hover:text-moss"
      >
        <ArrowLeft size={14} />
        Goals
      </Link>

      <div className="mt-4">
        <Eyebrow
          primary={DOMAIN_LABEL[goal.aspect as Domain] ?? goal.aspect}
          secondary={horizonLabel ?? (kind === "habit" ? "Habit" : undefined)}
        />
        <h1 className="mt-3 text-2xl leading-snug text-pine">{goal.title}</h1>
      </div>

      <div className="mt-10">
        <TendControl goalId={goal.id} kind={kind} />
      </div>

      <div className="mt-12">
        <Eyebrow primary="Tended" />
        {touches.length === 0 ? (
          <Voice className="mt-6 text-left text-[1.05rem] text-pine">
            {kind === "habit"
              ? "Not yet tended. The rhythm begins the first time you do."
              : "No moments logged yet. This is where its history will gather."}
          </Voice>
        ) : (
          <ul className="mt-5">
            {touches.map((t, i) => (
              <TouchRow key={`${t.day}-${i}`} touch={t} />
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
