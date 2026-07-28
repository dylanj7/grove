import { latestPoint, type RhythmData, type Series } from "@/lib/rhythm";

// ============================================================================
// THE RHYTHM CHART — small multiples on one shared time axis.
// ----------------------------------------------------------------------------
// FORM. Four facets, one series each, stacked and column-aligned by day. This
// is deliberately NOT three lines on shared axes: mood, energy and focus are
// coarse 1–5 dials, and overlaying them makes spaghetti at exactly the
// resolution where the data is weakest. Stacked facets put last night's sleep
// directly above today's focus, so the body→mind coupling — the thing Grove
// exists to show — is read off the alignment instead of asserted in prose.
//
// BARS, NOT LINES. A line interpolates. A day with no check-in would get a
// value the user never gave, drawn with the same confidence as one they did.
// Bars leave a gap, and a gap is the truth.
//
// SCALES ARE NEVER SHARED ACROSS FACETS. Sleep is in hours, the dials are 1–5;
// putting them on one axis would be the dual-axis mistake wearing a disguise.
// Each facet owns its scale, and no facet prints a number for the dials — the
// ends are words ("heavy" → "light"), because Grove speaks in senses and a
// mood of 4/5 is a score, which is the one thing the product refuses to be.
//
// COLOR. Two hues, by pillar, from the validated data steps (see globals.css).
// Because each facet is a single series it needs no legend — the row label is
// the identity channel. Both steps sit just under 3:1 on the light surface,
// which obliges a relief channel, so every facet carries a visible direct
// label and the whole chart carries a table view underneath.
// ============================================================================

const BAND = 24; // per-day column width
const GAP = 2; // the surface gap between touching bars
const H = 54; // plot height
const MIN_BAR = 3; // so the lowest real value never vanishes into the baseline

function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Facet({ series, todayKey }: { series: Series; todayKey: string }) {
  const n = series.points.length;
  const width = n * BAND;
  const barW = BAND - GAP;
  const hue = series.pillar === "body" ? "var(--viz-body)" : "var(--viz-mind)";
  const latest = latestPoint(series);

  return (
    <figure className="space-y-1.5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: hue }}
          />
          <span className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-canopy">
            {series.label}
          </span>
        </span>
        {/* The one direct label per facet — the newest real reading. Text wears
            a text token, never the data hue; the swatch above carries identity. */}
        <span className="text-[0.8rem] text-pine">
          {latest ? series.format(latest.value!) : "no reading yet"}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${series.label}, last ${n} days`}
        className="block overflow-visible"
      >
        {series.points.map((p, i) => {
          const x = i * BAND;
          const isToday = p.day === todayKey;
          const label = `${dayLabel(p.day)} — ${
            p.value == null ? "no reading" : series.format(p.value)
          }`;

          if (p.value == null) {
            return (
              // An empty band still answers on hover and to a screen reader, so
              // a gap is explicitly "no reading" rather than ambiguous.
              <rect key={p.day} x={x} y={0} width={barW} height={H} fill="transparent">
                <title>{label}</title>
              </rect>
            );
          }

          const h = Math.max(MIN_BAR, (p.value / series.max) * H);
          return (
            <path
              key={p.day}
              d={barPath(x, H - h, barW, h)}
              fill={hue}
              opacity={isToday ? 1 : 0.72}
            >
              <title>{label}</title>
            </path>
          );
        })}
        {/* Baseline: hairline, solid, one step off the surface. */}
        <line
          x1={0}
          y1={H}
          x2={width}
          y2={H}
          stroke="var(--sage)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between text-[0.6rem] uppercase tracking-[0.1em] text-canopy/60">
        <span>{series.ends[0]}</span>
        <span>{series.ends[1]}</span>
      </div>
    </figure>
  );
}

export default function RhythmChart({
  data,
  todayKey,
}: {
  data: RhythmData;
  todayKey: string;
}) {
  const first = data.days[0];
  const last = data.days[data.days.length - 1];

  return (
    <div className="space-y-7">
      {data.series.map((s) => (
        <Facet key={s.key} series={s} todayKey={todayKey} />
      ))}

      <div className="flex justify-between text-[0.62rem] uppercase tracking-[0.12em] text-canopy/70">
        <span>{dayLabel(first)}</span>
        <span>Today</span>
      </div>

      {/* The table view. It is the relief channel the light-mode contrast WARN
          obliges, and independently the honest way to read exact values — no
          chart should be the only way to get at your own numbers. Native
          <details>, so it costs no JavaScript. */}
      <details className="group border-t border-sage/70 pt-4">
        <summary className="grove-press cursor-pointer list-none text-[0.68rem] font-medium uppercase tracking-[0.14em] text-canopy hover:text-moss focus-visible:outline-none focus-visible:underline">
          <span className="group-open:hidden">Read the numbers</span>
          <span className="hidden group-open:inline">Hide the numbers</span>
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-left text-[0.78rem]">
            <caption className="sr-only">
              Daily readings from {dayLabel(first)} to {dayLabel(last)}
            </caption>
            <thead>
              <tr className="border-b border-sage/70">
                <th scope="col" className="py-2 pr-3 font-medium text-canopy">
                  Day
                </th>
                {data.series.map((s) => (
                  <th key={s.key} scope="col" className="py-2 pr-3 font-medium text-canopy">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.days.map((day, i) => (
                <tr key={day} className="border-b border-sage/40 last:border-0">
                  <th scope="row" className="py-2 pr-3 font-normal text-canopy">
                    {dayLabel(day)}
                  </th>
                  {data.series.map((s) => {
                    const v = s.points[i]?.value;
                    return (
                      <td key={s.key} className="py-2 pr-3 text-pine">
                        {v == null ? "—" : s.format(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
