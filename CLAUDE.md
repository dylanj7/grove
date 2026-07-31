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
| **`/home`** | The letter, the intentions it asked for, the invitation to capture, the compact grove, the body, the vectors. |
| **`/grove`** | The whole record: the tree, Ask Grove, the letters archive by week. |
| **`/rhythm`** | Fourteen days of body + mind as data, plus the verified patterns. |
| **`/you`** | Appearance, notifications, band, account. Rhythms/vectors are *managed* at `/goals`, reached from here. |
| **Capture** | A **sheet**, not a route — `components/capture-sheet.tsx`, opened from the tab bar's center button or `?capture=1`. |
| **`/welcome`** | Setup. Outside the `(app)` group, so no tab bar. Reached only from the root redirect. |

Old paths (`/today`, `/checkin`, `/body`, `/evening`, `/history`) are redirected
in `next.config.ts`, answered before any React renders.

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

# The tree (and the one rule it exists to obey)

`lib/grove-tree.ts` + `components/tree.tsx`, full width at the top of `/grove`
and compact on `/home`. It is the only view of the **whole** record —
everything else in the app is a 14-day window.

The brief was "track but not measure", which is harder than it sounds: a tree
that fills up as you show up is a streak wearing bark. Three properties resolve
it, and all three are load-bearing:

- **The skeleton is time, not effort.** Trunk and branches grow from weeks
  elapsed, so the tree grows on the weeks you never open the app. There is no
  state in which it shrinks or wilts. That is what makes it safe to care about.
- **A leaf is a day you set something down; its LIFT is how that day felt** —
  not how well it went. A heavy day is on the tree, sitting lower. So a hard
  month is visible as texture, never as absence.
- **No total.** No count, no percentage, no "fullness" — and because leaf
  position carries felt state rather than merit, there is no scalar to extract
  and rank.

The skeleton is drawn rather than implied for a reason recorded in the file: a
leaf-per-day canopy with no branches only reads as a tree at hundreds of days.
At a dozen it is confetti falling past a stick — exactly when a new user sees it.

# Ask Grove

`app/api/ask/route.ts` + `components/ask-grove.tsx`. The honesty layer with a
door on it: ask a question about your own record and the answer is assembled
**only** from the patterns `lib/patterns.ts` already verified plus the factual
window. Requires `scripts/phase6.sql` (the `questions` table) — it stores the
history and backs the daily cap, which must be durable because a serverless
in-memory counter resets on every cold start.

**"Your record can't answer that yet" is the feature, not a failure path.** It's
what no notes app and no wellness chatbot will ever tell you, and it's what makes
the answers that *do* come back worth anything. Most of that system prompt's
length defends it — this is the exact surface where a model most wants to be
helpful and invent a correlation.

# The model layer

Three jobs, three tiers, one file: `lib/model.ts`. Nothing else in the app names
a model. Roughly $1.05/user/month, down from ~$2.75.

The single largest saving was not the tiering — it was **quantizing volatile
facts out of the brief's content signature** (`lib/patterns.ts`). Step counts
drift all day as the band syncs; every drift changed the signature and bought a
fresh Opus letter. The letter was designed to generate twice a day and was
regenerating on step noise. Steps are now rounded to the nearest 1000, active
minutes to 15 — which is also the more truthful register, since the letter is
forbidden to treat a step count as a target and has no business knowing it to
the digit.

**Never put a raw dial number in a prompt.** `windowSummary()` used to emit
`mood 4/5, energy 3/5`, and Ask duly answered a question with "a single recent
check-in (focus 4/5…)" — the product's loudest promise broken by its own context
string. The dials go in as words. A number the model is never given is a number
it can never echo.

The letter and the reply run opposite settings on purpose:

- **The letter** (`lib/brief.ts`) — **Opus 5**, adaptive thinking,
  `effort: "medium"`, **structured outputs** (`output_config.format`) so the JSON
  shape is enforced rather than requested, and its system prompt is
  **cache-marked** (~1.4k tokens, byte-identical for every user, and briefs
  cluster in the morning — so at scale most letters read the prefix at a tenth of
  input price). Generated once per (day, slot), then frozen by the content
  signature in `lib/brief-read.ts`. Handle `stop_reason: "refusal"` before
  reading content — people write hard things in a reflection.
- **The reply** (`app/api/reply/route.ts`) — **Haiku 4.5**, streamed, no
  `thinking` and no `output_config` (that model predates both controls and
  rejects them). This is the one call where latency *is* the feature: the user is
  still looking at the screen. It is also not a reasoning problem — `patterns.ts`
  already did the reasoning — which is why it tiers down cleanly: measured 1.6s
  to first token vs 2.5s, at ~$0.0002 a call. The system prompt keeps the no-XML
  guard.
- **Ask** (`app/api/ask/route.ts`) — **Opus 5**, adaptive, streamed. Tiering this
  down would be the wrong economy: deciding what a specific record does and does
  not license is exactly the judgment that keeps the answer honest, and exactly
  where a cheaper model starts being agreeable instead of correct.

Both are handed only the verified patterns and a factual window summary, and
both are forbidden from referencing anything else. That constraint is the
product; don't relax it to make the copy warmer.

# Data visualization

`components/rhythm-chart.tsx` — small multiples, one series per facet, column
-aligned on a shared time axis so body→mind coupling is *seen*, not asserted.
Never lines: a line interpolates across a day with no check-in and invents a
value. Never put sleep-hours and the dials on one axis.

**Two marks, because there are two kinds of data** (`lib/rhythm.ts` holds the
`kind` field). Sleep is a *magnitude* → a bar from a true zero, plus a dashed
reference at the person's usual night (without it, every night between six and
eight hours is a near-identical near-full column and a 90-minute swing is
invisible). The dials are *ordinal positions on a scale of words* → a mark on a
track. A bar there claimed "bright" is five times "heavy", rendered the worst
possible day as a visible column of something, and made a sparse fortnight look
like a broken chart instead of eleven days nobody wrote anything down.

**Every direct label carries its age.** The facet headline used to print the
newest reading with no date, so a mood set down ten days ago read as the present
tense — the chart stating something false while the rest of the app was built to
make that impossible. `latestOf()` returns `daysAgo` and the label always says it.

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

**One entrance, not a cascade.** `.grove-enter` lives on `Screen`, so every route
arrives once, as a unit, in 190ms. It replaced `.grove-stagger`, which put a
420ms rise on *every direct child* of *every screen* with delays out to 200ms —
lovely on first paint, and re-run on every tab tap, so the screen dismantled and
reassembled itself in waves on top of the route change. ~620ms of movement to
look at a screen you were already looking at is what "choppy" meant; no easing
fixes it, because the problem was that it ran at all. Each route also has a
`loading.tsx`, so a tap paints instantly instead of freezing the old screen.

React's `<ViewTransition>` would be better still, but **don't reach for it on
this version**: `experimental.viewTransition` does not switch Next 16.2.9 to the
React experimental channel (only `taint`, `transitionIndicator` and
`gestureTransition` do), and stable React 19.2.4 doesn't export
`unstable_ViewTransition` — so the flag buys an undefined import, not a crossfade.

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

# Notifications (Phase 8 — nudges that fire on signal)

`lib/nudges.ts` is the honesty layer's third part, and it is the same kind of
code as `patterns.ts`: pure, deterministic, no model, no clock read, no
database. Given a window it returns ranked candidates; `app/api/nudges/run`
decides whether any of them clears the ceiling and sends it over Web Push
(`lib/push.ts`, `public/sw.js`).

**The schedule is not the trigger, and that is the whole design.** Every gate
that matters — `WEEKLY_CAP` (3), `COOLDOWN_DAYS` (4), `MIN_GAP_HOURS` (20),
`isCivilHour` (9–21 *on the device*) — lives in `lib/nudges.ts`, so the route is
safe to run hourly, daily, or twice by accident and behaves identically. A
promise that depends on a crontab entry is a configuration, not a promise.
`vercel.json` runs it daily at 16:00 UTC only because Vercel's Hobby plan
permits nothing faster; see `scripts/nudges-cron.md`, including which timezones
that costs.

Three detectors, and the copy rules are as load-bearing as the thresholds: a
nudge names a fact and offers a door, never a verdict. `rhythm_quiet` offers to
**let go** as readily as to keep — the sentence nothing else in the category
will send you. `energy_unspent` stops at "Grove noticed"; one clause further and
it is telling someone they wasted two good days, which is a grade.

`public/sw.js` **has no `fetch` handler on purpose.** Grove's screens are Server
Components rendered from a 14-day window, so a cached shell would serve
yesterday's letter and yesterday's body as though they were today's — a machine
for confidently saying something false. Offline is named out loud instead
(`components/offline-note.tsx`).

Two proxy exclusions are load-bearing: `sw.js` and `manifest.webmanifest` are
fetched by the *browser*, not the app, and were being 307'd to `/login`. A
service worker that redirects cannot be registered at all; a manifest that
redirects means Grove can't be installed — and on iOS un-installable means Web
Push is unavailable entirely. `/api/nudges/run` is public for the same class of
reason (Vercel Cron sends no cookies) and authenticates itself with
`CRON_SECRET`, returning 401 to everyone when that is unset.

# The cold start (Phase 8 — `/welcome`)

Day one had no data, so no letter, so no reason to come back on day two. Four
questions, each of which does two jobs: they plant a vector and a rhythm *and*
give the day-one letter something to be about. `worthBriefing` on Home now
includes `goals.length > 0`, which is the actual fix — a letter exists before
any capture.

Every answer is skippable and every answer does something. Both halves are
required: a setup wall would reinstate the gate Home spent Phase 6 removing, and
a question whose answer is discarded is the app pretending to listen on the
first screen where it asks for anything. "When does your day actually start?"
moves the morning/evening cutoff (`eveningCutoff` in `lib/slot.ts`, carried on a
`daystart` cookie beside `tzoff`).

Setup ends by **opening the capture sheet**, not by congratulating anyone.

**The onboarding gate lives in `app/page.tsx` and nowhere else.** Every sign-in
lands on `/`, so a new account passes through exactly once. Putting it in
`app/(app)/layout.tsx` would add a profile read to every navigation forever to
answer a question that changes once per account; a cookie carries it afterwards.

`components/tree-preview.tsx` renders Day 1 / Day 7 / Day 30 as **real trees** —
`buildGrove()` over synthetic days through the same `<Tree>` the app uses. A
flattering hand-drawn "day 30" would be the app's first statement about itself
being a small lie.

# The tree, promoted (Phase 8 — §3.8)

Compact on Home (`components/home-grove.tsx`), behind its own Suspense boundary
because it reads the *whole* record rather than the 14-day window and nothing
that slow may sit on the first paint.

**Coming back after a gap gets a warm line, and for Grove it is also literally
true**: the trunk grows from weeks elapsed, so the tree really did keep growing
while nobody was looking. That is why `buildGrove` anchors the trunk to today
rather than to the last capture.

On `/grove`, leaves are now **anchors into the letters archive** — `Tree` takes
`linkFor(day)`, and a leaf whose day has no letter on the page stays a bare
ellipse rather than becoming a dead link. Each anchor carries a transparent
44px disc, because the leaf itself is a 16×10 target only a mouse can hit.

# Desktop (§5.7)

Mobile-only is the intent, but the deploy is a URL and every first share opens
on a laptop. From `md` up the column is framed against a softer ground and the
tab bar is pinned to it — a full-width nav bar on a 27-inch display is the
clearest possible tell that you are looking at a website in a costume. Below
`md` nothing changes.
