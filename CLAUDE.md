@AGENTS.md

# What Grove is

One connected system — body, mind, direction — read by an intelligence that is
only ever allowed to say what is true. That's the product, and it's the part a
notes app structurally cannot copy. Everything below serves it.

**The two rules that outrank everything.** No scores, no streaks, no grades, no
comparison — not even against the user's own past. And nothing is asserted that
separate, deterministic code hasn't verified first (`lib/patterns.ts`). Grove is
allowed to be quiet. It is not allowed to be motivating and wrong.

# The shape of the app

Four destinations and one action:

| | |
|---|---|
| **`/home`** | The read, the body, today's rhythms, an invitation to capture. |
| **`/rhythm`** | Fourteen days of body + mind, the verified patterns, the letters. |
| **`/goals`** | Rhythms (habits) and vectors (goals). |
| **`/you`** | Appearance, band, account. |
| **Capture** | A **sheet**, not a route — `components/capture-sheet.tsx`, opened from the tab bar's center button or `?capture=1`. |

Old paths (`/grove`, `/today`, `/checkin`, `/body`, `/evening`, `/history`) are
redirected in `next.config.ts`, answered before any React renders.

# Three things that are easy to break

**1. The floor and the ceiling.** `lib/read.ts` computes an honest headline and
line from the window — pure, deterministic, microseconds. That is the FLOOR, and
`/home` renders it as the Suspense *fallback* for the letter. `lib/brief.ts` (the
model) is the CEILING and streams in on top. Consequences: there is no check-in
gate, and **an LLM call must never sit on the render path of a first paint.** If
you find yourself awaiting a model before a screen can show, you've undone this.

**2. Auth is a local verification, not a round-trip.** `getUserId()` /
`getSessionUser()` in `lib/supabase/server.ts` use `getClaims()`, which verifies
the ES256 JWT locally via WebCrypto. This project's signing keys are asymmetric —
that's what makes it local. Do **not** reintroduce `auth.getUser()` in a page,
layout, action, route, or the proxy: it was being called three times per
navigation and was most of the time-to-first-byte. RLS is still the real
boundary.

**3. Mutations are optimistic and do not refresh the page.** `TendRow` flips the
mark and fires the write in a transition; only a failure moves the UI back. The
old version called `router.refresh()` on every tap — a full server render and
four queries to confirm state the client already had.

# The model layer

`claude-opus-5` in both places, with opposite settings on purpose:

- **The letter** (`lib/brief.ts`) — adaptive thinking, `effort: "medium"`,
  **structured outputs** (`output_config.format`) so the JSON shape is enforced
  rather than requested. Generated once per (day, slot), then frozen by the
  content signature in `lib/brief-read.ts`. Handle `stop_reason: "refusal"`
  before reading content — people write hard things in a reflection.
- **The reply** (`app/api/reply/route.ts`) — streamed, `effort: "low"`, and the
  one place thinking is **disabled**: thinking completes before the first text
  token, which measured ~4.2s of silence vs ~2.6s with it off, for no gain on a
  short honest sentence. The system prompt carries the no-XML guard that
  disabling thinking obliges.

Both are handed only the verified patterns and a factual window summary, and
both are forbidden from referencing anything else. That constraint is the
product; don't relax it to make the copy warmer.

# Data visualization

`components/rhythm-chart.tsx` — small multiples, one series per facet, column
-aligned on a shared time axis so body→mind coupling is *seen*, not asserted.
Bars, never lines: a line interpolates across a day with no check-in and invents
a value. Never put sleep-hours and the 1–5 dials on one axis.

The chart hues (`--viz-body`, `--viz-mind`) are deliberately **not** the brand
greens — run through the categorical validator, moss sits at chroma 0.049 (floor
0.10) and dark-mode moss-vs-ember lands at ΔE 5.3 under protanopia (floor 6).
The two steps in `globals.css` clear every check in both modes. They sit just
under 3:1 on the light surface, which is why every facet carries a visible
direct label and the chart carries a table view — that relief is required, not
decorative.

# The visual system

The palette tokens in `globals.css` are **semantic roles**, not fixed colors
(`mist` = the ground, `soil` = deepest text), each defined under four scopes:
`:root`, the `prefers-color-scheme` media query, and both `data-theme` overrides.
That's what gave every screen a night mode without touching a component. Grove's
evening ritual happens in the dark; a white page at 11pm is hostile.

`.grove-press` on everything tappable is most of what separates "a website with
buttons" from an app. Keep it.

# The band (Phase 5 — Google Health)

Wearable data flows in behind the provider-neutral seam: `lib/health.ts` (the
hinge — token store, refresh, the lazy per-day sync, connect/disconnect) and
`lib/health-google.ts` (every Google-specific detail — OAuth params, scope
strings, the v4 API). Everything above the seam stays source-blind. The token
table is `health_connections` (was `fitbit_connections`); a `physical_days` row
now carries a `source`, and a day can hold both a `manual` and a `google_health`
row, merged provider-over-manual per metric in `lib/window.ts`.

The forced re-fetch that used to block the check-in screen is now
`POST /api/health/sync`, called fire-and-forget by the capture sheet — same
"a capture is the honest moment to re-pull" behavior, none of the waiting.

**Restricted scopes couple to Phase 6, not this phase.** Every Google Health
scope is *Restricted*: it needs Google's privacy/security review before a public
launch. For now that's fine — the developer connects as a registered **test
user** on the OAuth consent screen. But multi-user (Phase 6) cannot ship
publicly until that consent screen passes Google's review. If connecting fails
with "access blocked / app not verified," the usual cause is the connecting
account not being on the test-user list (Settings surfaces this honestly).

**Pre-GA hedge.** The Google Health API is pre-GA; scope identifiers and
dataType/response shapes may still shift. The best-known strings live in
`lib/health-google.ts` (scopes overridable via `GOOGLE_HEALTH_SCOPES`), data
mapping degrades to absent rather than throwing, and the seam absorbs GA changes
so the body pillar never needs a rewrite. Run `scripts/phase5.sql` once before
the new code touches the database.
