import { MAX_WEEKS, type GroveShape } from "@/lib/grove-tree";

// ============================================================================
// THE TREE — the only place in Grove that shows your whole record at once.
// ----------------------------------------------------------------------------
// Read lib/grove-tree.ts first; it holds the rule this file draws. In short:
// the tree is TIME, a leaf is a day you set something down, and a leaf's lift
// is how that day felt — not how well it went. There is no count anywhere on
// this drawing and no scalar you could extract from it to rank anything.
//
// ---------------------------------------------------------------------------
// WHY THE STRUCTURE IS DRAWN AND NOT IMPLIED.
//
// The first version of this had no branches: leaves were placed at (week →
// height, weekday → sideways) and the silhouette was left to emerge from them.
// It emerged for nobody. A person with a fortnight of check-ins has perhaps a
// dozen leaves, and a dozen ellipses distributed over a canopy-sized area is
// not a sparse tree — it is confetti falling past a stick. The form only works
// at hundreds of days, which is precisely when a user needs it least.
//
// So the SKELETON — trunk and branches — is generated from tenure alone, and
// leaves are hung on its tips. Now the drawing is a tree from the first week,
// because a tree in winter is still obviously a tree; a record with few days in
// it reads as early spring rather than as a rendering bug. And it keeps the
// property that matters most: the structure grows on the weeks you never opened
// the app, so there is no state in which the tree reproaches you.
//
// WHAT THE GEOMETRY CARRIES, now that tips are discrete:
//   • Depth and reach of the branching = how long the record has existed.
//   • A leaf's TIP = where its day falls in time. Tips are ordered low-to-high,
//     oldest day at the lowest tip, so the crown is your recent life.
//   • A leaf's LIFT AND TILT at its tip = how that day felt. Bright days lift,
//     heavy days droop. Never a colour: a green-good / orange-bad canopy would
//     be a grade drawn in the one place the eye cannot help but total up.
//
// An earlier draft also encoded weekday as horizontal position. It was dropped
// deliberately — with sparse data it was unreadable, and two illegible encodings
// are worse than one legible one.
// ============================================================================

const VB_W = 240;
const VB_H = 280;
const CX = VB_W / 2;
const GROUND_Y = 258;

const LEAF_RX = 8;
const LEAF_RY = 5;

/** Stable per-leaf jitter. Deterministic from the date so the server and the
 *  client draw the same tree — Math.random here would be a hydration mismatch
 *  AND would mean your grove looked different every time you glanced at it. */
function jitter(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (((h % 1000) + 1000) % 1000) / 1000 * 2 - 1; // −1 … 1
}

type Segment = { x1: number; y1: number; x2: number; y2: number; w: number };
type Tip = { x: number; y: number; angle: number };

/**
 * The skeleton, from tenure and nothing else.
 *
 * Depth is stepped rather than continuous so the tree visibly BECOMES more of a
 * tree a few times over the first year, instead of creeping imperceptibly. Each
 * step is a real event you'd notice — which is the only "reward" in the whole
 * design, and it is paid for by time passing, not by showing up.
 */
function buildSkeleton(weeks: number): { segments: Segment[]; tips: Tip[] } {
  const t = Math.min(weeks, MAX_WEEKS) / MAX_WEEKS;
  const depth = weeks < 3 ? 2 : weeks < 10 ? 3 : weeks < 26 ? 4 : 5;
  const trunkH = 58 + 34 * Math.pow(t, 0.6);

  const segments: Segment[] = [];
  const tips: Tip[] = [];

  const trunkTopY = GROUND_Y - trunkH;
  segments.push({ x1: CX, y1: GROUND_Y, x2: CX, y2: trunkTopY, w: 9 });

  // −90° is straight up in SVG's y-down space.
  const grow = (x: number, y: number, angle: number, len: number, d: number) => {
    if (d === 0) {
      tips.push({ x, y, angle });
      return;
    }
    // A deterministic lean per node so the tree isn't a perfect mathematical
    // fan. Seeded from the node's own coordinates, so it never changes.
    const lean = jitter(`${d}:${Math.round(x)}:${Math.round(y)}`, 17) * 7;
    const spread = 30 - d * 2;

    for (const dir of [-1, 1]) {
      const a = angle + dir * spread + lean;
      const rad = (a * Math.PI) / 180;
      const nx = x + Math.cos(rad) * len;
      const ny = y + Math.sin(rad) * len;
      segments.push({ x1: x, y1: y, x2: nx, y2: ny, w: Math.max(1.6, d * 1.9) });
      grow(nx, ny, a, len * 0.74, d - 1);
    }
  };

  grow(CX, trunkTopY, -90, 34 + 12 * t, depth);
  return { segments, tips };
}

/**
 * THE TREE AS NAVIGATION.
 *
 * A leaf is a day, and a day usually has a letter — so the canopy is already an
 * index of the archive, and it took until Phase 8 to say so. Pass `linkFor` and
 * each leaf whose day resolves to a target becomes a real anchor: no client
 * JavaScript, no hit-testing, keyboard reachable, and the whole thing still
 * server-renders as one SVG.
 *
 * Leaves with no target stay bare ellipses rather than becoming dead links. A
 * day you set something down but Grove never wrote about is a real state
 * (letters need a slot to have happened), and an anchor that goes nowhere is
 * worse than no anchor.
 */
export function Tree({
  shape,
  className = "",
  linkFor,
  labelFor,
}: {
  shape: GroveShape;
  className?: string;
  linkFor?: (day: string) => string | null;
  labelFor?: (day: string) => string;
}) {
  const { weeks, leaves } = shape;
  const { segments, tips } = buildSkeleton(Math.max(weeks, 1));

  // Tips ordered lowest-first, so assigning leaves in day order puts the oldest
  // days on the lowest branches and this week's at the crown. Ties broken on x
  // so the ordering is total and the tree never reshuffles between renders.
  const ordered = [...tips].sort((a, b) => b.y - a.y || a.x - b.x);

  const byDay = [...leaves].sort((a, b) => (a.day < b.day ? -1 : 1));

  return (
    <svg
      // Cropped from the top rather than sized to the drawing: the frame is cut
      // to fit a FULL-GROWN tree, so a young one sits low in it with visible
      // room overhead. That headroom is the point — it is the only thing on the
      // screen that says "this keeps going" without counting anything.
      viewBox={`0 ${VB_H - 222} ${VB_W} 222`}
      className={className}
      role="img"
      aria-label={
        leaves.length === 0
          ? "Your grove: a young tree, no days set down yet."
          : "Your grove. The tree is how long you've been keeping this; each leaf is a day you set something down, sitting higher or lower with how that day felt."
      }
    >
      <g className="grove-breathe">
        {/* Ground, so the tree is rooted rather than floating. */}
        <ellipse
          cx={CX}
          cy={GROUND_Y + 3}
          rx={30}
          ry={6}
          fill="var(--color-sage)"
          opacity={0.5}
        />

        <g stroke="var(--color-pine)" strokeLinecap="round" fill="none">
          {segments.map((s, i) => (
            <line
              key={i}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              strokeWidth={s.w}
            />
          ))}
        </g>

        <g className="grove-sway">
          {byDay.map((leaf, i) => {
            // More days than tips is the normal case for a long record: leaves
            // wrap around the canopy, layering it rather than overflowing it.
            const tip = ordered[i % ordered.length];
            const ring = Math.floor(i / ordered.length);

            const mood = leaf.mood ?? 3; // unmarked sits neutral, never low
            const lift = (mood - 3) * 3.2;

            const x = tip.x + jitter(leaf.day, 7) * 5 + (ring % 2 ? 4 : -4) * (ring ? 1 : 0);
            const y = tip.y - lift + jitter(leaf.day, 3) * 4 - ring * 1.5;
            const tilt = tip.angle + 90 + (mood - 3) * 9 + jitter(leaf.day, 13) * 12;

            // Two tones, alternating deterministically, for depth from light
            // rather than from new colour. NOT tied to the day's data.
            const fill =
              jitter(leaf.day, 5) > 0.1 ? "var(--color-canopy)" : "var(--color-moss)";

            const ellipse = (
              <ellipse
                cx={x}
                cy={y}
                rx={LEAF_RX}
                ry={LEAF_RY}
                fill={fill}
                transform={`rotate(${tilt} ${x} ${y})`}
              />
            );

            const href = linkFor?.(leaf.day) ?? null;
            if (!href) return <g key={leaf.day}>{ellipse}</g>;

            return (
              <a
                key={leaf.day}
                href={href}
                className="grove-leaf-link"
                aria-label={labelFor?.(leaf.day) ?? leaf.day}
              >
                {/* A transparent disc behind the leaf, sized to the 44px touch
                    minimum at the scales this is drawn at. Without it the tap
                    target is a 16×10 ellipse, which is a target only a mouse
                    can hit — and the leaf is the one thing on this drawing a
                    person will instinctively reach for. */}
                <circle cx={x} cy={y} r={11} fill="transparent" />
                {ellipse}
              </a>
            );
          })}
        </g>
      </g>
    </svg>
  );
}
