import { buildGrove, type TreeDay } from "@/lib/grove-tree";
import { Tree } from "@/components/tree";

// ============================================================================
// DAY 1 · DAY 7 · DAY 30 — the only promise Grove makes during onboarding.
// ----------------------------------------------------------------------------
// It exists to do one job, and it is a retention job rather than a decorative
// one: set the expectation that this is a SLOW product before the user has
// invested anything in it. A person who opens Grove on day two, sees a sparse
// tree and one short letter, and had no idea that was the intended shape of day
// two, concludes the app is empty. The same person, having seen this, concludes
// they are on day two. That reframe is what buys the first fortnight, and it is
// cheap because it is simply true.
//
// THESE ARE REAL TREES, NOT ILLUSTRATIONS. Each frame is buildGrove() over
// synthetic days fed to the same <Tree> the app draws everywhere else — so what
// is shown here is exactly what that many days actually looks like, including
// the fact that a week is still visibly sparse. A hand-drawn "day 30" that
// flattered the real thing would be the app's first statement about itself
// being a small lie, in a product whose entire claim is that it doesn't tell
// them.
//
// The moods are deliberately mixed, including low ones. A preview of thirty
// uniformly bright days would quietly teach the wrong lesson about what the
// tree is for — heavy days are on it too, sitting lower, and that is the whole
// point of the shape.
// ============================================================================

const DAY_MS = 86_400_000;

// A fixed, unremarkable fortnight-and-a-half of felt states, cycled. Fixed
// because this must render identically on the server and the client, and
// unremarkable because it is describing an ordinary life, not a good one.
const MOODS = [3, 4, 2, 4, 3, 5, 2, 3, 4, 3, 1, 4, 5, 3, 2, 4, 3, 4, 2, 5];

/** `count` days ending today, the way a real record would have accumulated. */
function synthetic(count: number, today: string): { days: TreeDay[]; today: string } {
  const end = Date.parse(`${today}T00:00:00Z`);
  const days: TreeDay[] = [];
  for (let i = 0; i < count; i++) {
    const day = new Date(end - (count - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    // Not every day is captured, at any stage. A preview in which the user
    // never misses one sets up the exact failure this component exists to
    // prevent: a person measuring themselves against a picture.
    if (count > 7 && i % 5 === 3) continue;
    days.push({ day, mood: MOODS[i % MOODS.length] });
  }
  return { days, today };
}

const FRAMES: { label: string; count: number; note: string }[] = [
  { label: "Day 1", count: 1, note: "One day, one leaf." },
  { label: "Day 7", count: 7, note: "A week in, the first patterns get checked." },
  { label: "Day 30", count: 30, note: "A month is where it starts telling you things." },
];

export default function TreePreview({ today }: { today: string }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {FRAMES.map((frame) => {
          const { days } = synthetic(frame.count, today);
          const shape = buildGrove(days, today);
          return (
            <div key={frame.label} className="space-y-2">
              <div className="overflow-hidden rounded-xl border border-sage/60 bg-dawn">
                <Tree shape={shape} className="h-auto w-full" />
              </div>
              <p className="text-center text-[0.58rem] uppercase tracking-[0.14em] text-canopy">
                {frame.label}
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-[0.82rem] leading-relaxed text-canopy">
        {FRAMES[2].note} Grove is slow on purpose — it won&rsquo;t tell you a
        pattern it hasn&rsquo;t checked, and on day two there isn&rsquo;t one yet.
      </p>
    </div>
  );
}
