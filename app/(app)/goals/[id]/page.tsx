import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";

const ASPECT_LABEL: Record<string, string> = {
  physical: "Body",
  mental: "Mind",
  work: "Work",
};

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// A single intention, given room. Its history of touches is a calm record —
// not a progress bar racing to 100%.
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

  const { data: touches } = await supabase
    .from("goal_touches")
    .select("day")
    .eq("user_id", user!.id)
    .eq("goal_id", id)
    .order("day", { ascending: false });

  const list = touches ?? [];
  const horizon = goal.horizon === "short" ? "Short horizon" : "Long horizon";

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
          primary={ASPECT_LABEL[goal.aspect] ?? goal.aspect}
          secondary={horizon}
        />
        <h1 className="mt-3 text-2xl leading-snug text-pine">{goal.title}</h1>
      </div>

      <div className="mt-12">
        <Eyebrow primary="Tended" />
        {list.length === 0 ? (
          <Voice className="mt-6 text-left text-[1.05rem] text-pine">
            No moments logged yet. This is where its history will gather.
          </Voice>
        ) : (
          <ul className="mt-5 space-y-0">
            {list.map((t, i) => (
              <li key={`${t.day}-${i}`} className="flex items-center gap-4 py-3">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-moss"
                />
                <span className="text-[0.95rem] text-pine">
                  {formatDay(t.day)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
