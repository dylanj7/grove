import { agoLabel, type RhythmData, type Series } from "@/lib/rhythm";

// ============================================================================
// THE RHYTHM CHART — small multiples on one shared time axis.
// ----------------------------------------------------------------------------
// FORM. Four facets, one series each, stacked and column-aligned by day. This
// is deliberately NOT three lines on shared axes: mood, energy and focus are
// coarse five-step dials, and overlaying them makes spaghetti at exactly the
// resolution where the data is weakest. Stacked facets put last night's sleep
// directly above today's focus, so the body→mind coupling — the thing Grove
// exists to show — is read off the alignment instead of asserted in prose.
//
// NEVER LINES. A line interpolates. A day with no check-in would get a value
// the user never gave, drawn with the same confidence as one they did.
//
// TWO MARKS, BECAUSE THERE ARE TWO KINDS OF DATA (see lib/rhythm.ts):
//   • Sleep is a magnitude → a BAR from a true zero, plus a quiet reference
//     line at the person's usual night. Without that reference every night
//     between six and eight hours is a nearly identical near-full column and a
//     ninety-minute swing is invisible.
//   • The dials are ordinal positions on a scale of words → a MARK ON A TRACK.
//     A bar would claim that "bright" is five times "heavy", which is not a
//     thing that is true about moods, and would render the worst possible day
//     as a visible column of something.
//
// SCALES ARE NEVER SHARED ACROSS FACETS. Sleep is in hours, the dials are 1–5;
// putting them on one axis would be the dual-axis mistake wearing a disguise.
// No facet ever prints a number for the dials — the ends are words, because a
// mood of 4/5 is a score, which is the one thing the product refuses to be.
//
// EVERY DIRECT LABEL CARRIES ITS AGE. The previous version printed the newest
// reading with no date, so a mood set down ten days ago sat at the top of the
// facet reading as the present tense. On a sparse window the chart was stating
// something false. A reading now always says when it was.
//
// COLOR. Two hues, by pillar, from the validated data steps (see globals.css).
// Because each facet is a single series it needs no legend — the row label is
// the identity channel. Both steps sit just under 3:1 on the light surface,
// which obliges a relief channel, so every facet carries a visible direct
// label and the whole chart carries a table view underneath.
// ============================================================================

const BAND = 24; // per-day column width, in viewBox units
const GAP = 2; // the surface gap between touching marks
const H_BAR = 54; // plot height for the magnitude facet
const H_TRACK = 46; // plot height for an ordinal facet
const TRACK_PAD = 6; // so the top and bottom marks aren't clipped
const MARK_H = 5; // thickness of an ordinal mark
const MIN_BAR = 3; // so the lowest real magnitude never vanishes into the axis

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

/** Single letter for the shared day axis: M T W T F S S. */
function weekdayInitial(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { weekday: "narrow" });
}

/** y of an ordinal level (1 at the floor, `max` at the ceiling). */
function levelY(value: number, max: number): number {
  const span = H_TRACK - TRACK_PAD * 2 - MARK_H;
  return TRACK_PAD + ((max - value) / (max - 1)) * span;
}

function Facet({ series, todayKey }: { series: Series; todayKey: string }) {
  const n = series.points.length;
  const width = n * BAND;
  const markW = BAND - GAP;
  const hue = series.pillar === "body" ? "var(--viz-body)" : "var(--viz-mind)";
  const isBar = series.kind === "magnitude";
  const H = isBar ? H_BAR : H_TRACK;
  const { latest } = series;

  const baselineY =
    isBar && series.baseline != null ? H_BAR - (series.baseline / series.max) * H_BAR : null;

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
        {/* The one direct label per facet. Text wears a text token, never the
            data hue; the swatch above carries identity. The recency clause is
            not decoration — without it this line silently claims to be now. */}
        {latest ? (
          <span className="text-[0.8rem] text-pine">
            {series.format(latest.value)}
            <span className="text-canopy/70"> · {agoLabel(latest.daysAgo)}</span>
          </span>
        ) : (
          <span className="text-[0.8rem] text-canopy/70">no reading yet</span>
        )}
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${series.label}, last ${n} days`}
          className="block overflow-visible"
        >
          {/* The lane. On an ordinal facet this is what turns eleven blank
              columns from "the chart is broken" into "eleven days you didn't
              set anything down" — the track is visibly there and empty. */}
          {!isBar && (
            <>
              <rect
                x={0}
                y={TRACK_PAD}
                width={width}
                height={H_TRACK - TRACK_PAD * 2}
                fill="var(--sage)"
                opacity={0.28}
                rx={3}
              />
              {/* The midpoint of the scale — "even", "steady", "okay". Gives the
                  marks something to sit above or below without grading them. */}
              <line
                x1={0}
                y1={levelY(3, series.max) + MARK_H / 2}
                x2={width}
                y2={levelY(3, series.max) + MARK_H / 2}
                stroke="var(--sage)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {series.points.map((p, i) => {
            const x = i * BAND;
            const isToday = p.day === todayKey;
            const label = `${dayLabel(p.day)} — ${
              p.value == null ? "no reading" : series.format(p.value)
            }`;

            if (p.value == null) {
              return (
                // An empty column still answers on hover and to a screen reader,
                // so a gap is explicitly "no reading" rather than ambiguous.
                <rect key={p.day} x={x} y={0} width={markW} height={H} fill="transparent">
                  <title>{label}</title>
                </rect>
              );
            }

            if (isBar) {
              const h = Math.max(MIN_BAR, (p.value / series.max) * H_BAR);
              return (
                <path
                  key={p.day}
                  d={barPath(x, H_BAR - h, markW, h)}
                  fill={hue}
                  opacity={isToday ? 1 : 0.72}
                >
                  <title>{label}</title>
                </path>
              );
            }

            return (
              <rect
                key={p.day}
                x={x}
                y={levelY(p.value, series.max)}
                width={markW}
                height={MARK_H}
                rx={2}
                fill={hue}
                opacity={isToday ? 1 : 0.78}
              >
                <title>{label}</title>
              </rect>
            );
          })}

          {/* The person's usual night. A REFERENCE, not a target: dashed, in a
              text token rather than a data hue, with no valence and nothing to
              beat. It exists so a short night looks short. */}
          {baselineY != null && (
            <line
              x1={0}
              y1={baselineY}
              x2={width}
              y2={baselineY}
              stroke="var(--canopy)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.5}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {isBar && (
            // Baseline: hairline, solid, one step off the surface.
            <line
              x1={0}
              y1={H_BAR}
              x2={width}
              y2={H_BAR}
              stroke="var(--sage)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Rendered as HTML, not <text>: this SVG is stretched horizontally to
            fill its column, which would smear any glyph inside it. */}
        {baselineY != null && (
          <span
            className="pointer-events-none absolute right-0 -translate-y-1/2 bg-mist pl-1 text-[0.55rem] uppercase tracking-[0.1em] text-canopy/70"
            style={{ top: baselineY }}
          >
            usual
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 text-[0.6rem] uppercase tracking-[0.1em] text-canopy/60">
        <span>{series.ends[0]}</span>
        {/* Coverage, stated plainly. A fortnight with three readings should say
            so rather than leave the eye to guess whether the gaps are missing
            data or flat days. */}
        <span className="normal-case tracking-normal text-canopy/50">
          {series.recorded} of {n} days
        </span>
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
  const n = data.days.length;

  return (
    <div className="space-y-7">
      {data.series.map((s) => (
        <Facet key={s.key} series={s} todayKey={todayKey} />
      ))}

      {/* THE SHARED DAY AXIS. The facets above are column-aligned to each other
          but were previously anchored to nothing — the only date context was a
          "Jul 15 … Today" pair below four charts, far from any column, so no
          individual mark could be placed in the week. A grid of equal fractions
          lines up with the equal bands in every facet's viewBox. */}
      <div
        className="grid gap-0 text-center text-[0.58rem] uppercase tracking-[0.06em] text-canopy/55"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {data.days.map((d) => (
          <span
            key={d}
            className={d === todayKey ? "font-medium text-pine" : undefined}
          >
            {weekdayInitial(d)}
          </span>
        ))}
      </div>

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
