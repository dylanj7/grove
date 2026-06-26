// The one living thing. A placeholder *shape* whose *motion* is real: the whole
// form breathes (~9s) and the canopy sways (~12s), out of phase. `treeState` is
// the seam — this phase feeds it a constant; later it's data-driven. Motion is
// CSS-only and disabled under prefers-reduced-motion (see globals.css).

export type TreeState = {
  /** 0 = a sapling (young grove), 1 = full canopy. */
  fullness: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function Tree({
  treeState,
  className = "",
  label = "Your grove",
}: {
  treeState: TreeState;
  className?: string;
  label?: string;
}) {
  const f = clamp(treeState.fullness, 0, 1);

  const cx = 100;
  const baseY = 246;
  const trunkH = 55 + 80 * f;
  const topY = baseY - trunkH;
  const hb = 7; // half base width
  const ht = 3; // half top width
  const R = 20 + 38 * f; // canopy radius

  // Tapered, slightly organic trunk.
  const trunk = `M ${cx - hb} ${baseY} C ${cx - hb} ${baseY - 22}, ${cx - ht} ${
    topY + 22
  }, ${cx - ht} ${topY} L ${cx + ht} ${topY} C ${cx + ht} ${topY + 22}, ${
    cx + hb
  } ${baseY - 22}, ${cx + hb} ${baseY} Z`;

  // Overlapping masses. Moss for the body, canopy (lighter) on top — depth from
  // light, not from new colors.
  const leaves = [
    { x: cx, y: topY - R * 0.35, r: R, fill: "var(--color-moss)" },
    { x: cx - R * 0.78, y: topY + R * 0.16, r: R * 0.8, fill: "var(--color-moss)" },
    { x: cx + R * 0.78, y: topY + R * 0.16, r: R * 0.8, fill: "var(--color-moss)" },
    { x: cx - R * 0.32, y: topY - R * 0.78, r: R * 0.62, fill: "var(--color-canopy)" },
    { x: cx + R * 0.36, y: topY - R * 0.52, r: R * 0.54, fill: "var(--color-canopy)" },
  ];

  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      role="img"
      aria-label={label}
    >
      <g className="grove-breathe">
        {/* Soft ground so the tree is rooted, not floating. */}
        <ellipse
          cx={cx}
          cy={baseY + 3}
          rx={26 + 24 * f}
          ry={6}
          fill="var(--color-sage)"
          opacity={0.5}
        />
        <path d={trunk} fill="var(--color-pine)" />
        <g className="grove-sway">
          {leaves.map((l, i) => (
            <circle key={i} cx={l.x} cy={l.y} r={l.r} fill={l.fill} />
          ))}
        </g>
      </g>
    </svg>
  );
}
