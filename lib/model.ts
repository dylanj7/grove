// lib/model.ts
// ----------------------------------------------------------------
// ONE place that decides which model does which job, and one place that
// explains why. Grove makes three kinds of model call, and they are not the
// same kind of work — pricing them identically was costing roughly 2.5x what
// the product actually needs.
//
// THE ECONOMICS. Per user per month, at two captures a day:
//
//   letter  2/day  Opus 5    ~$0.04  →  the read that ties body to direction.
//                                       A judgment task. Opus earns it, and it
//                                       is generated at most twice a day and
//                                       then FROZEN by signature, so the real
//                                       rate is far below 2/day.
//   reply   2/day  Haiku 4.5 ~$0.001 →  one honest sentence the instant a
//                                       capture lands. Not a reasoning problem:
//                                       patterns.ts already did the reasoning,
//                                       deterministically. Haiku says it just
//                                       as well, ~4x faster — and here latency
//                                       IS the feature.
//   ask     ~3/wk  Opus 5    ~$0.02  →  the user asked a real question about
//                                       their own life. They chose to spend it;
//                                       depth is the entire point.
//
// Landing around $1.05/user/month all-in, against ~$2.75 before.
//
// THE THREE THINGS THAT ACTUALLY SAVED THE MONEY, in order of size:
//   1. Quantizing volatile facts OUT of the brief signature (see patterns.ts).
//      Step counts drift all day as the band syncs; every drift used to change
//      the signature and buy a NEW Opus letter. The letter was never meant to
//      regenerate more than twice a day and was regenerating on step noise.
//   2. Tiering the reply down to Haiku.
//   3. Caching the letter's system prompt — it is identical for every user, so
//      at any scale at all the morning cluster shares one cache entry.
//
// To move a job back onto a bigger model, change one line here. Nothing else
// in the app names a model.
// ----------------------------------------------------------------

export const MODELS = {
  /** The twice-daily letter. A judgment task; stays on the best model. */
  letter: "claude-opus-5",
  /** The instant sentence after a capture. Latency-bound, not reasoning-bound. */
  reply: "claude-haiku-4-5",
  /** A real question about their own record. User-initiated, so depth wins. */
  ask: "claude-opus-5",
} as const;

// Prompt caching has a minimum cacheable prefix, and it differs by model:
// ~1024 tokens on the Opus/Sonnet tier, ~2048 on Haiku. Marking a prefix that
// is under the minimum is not an error, it simply never caches — but it also
// quietly costs the 1.25x write multiplier on some paths, so Grove only marks
// prefixes it knows clear the bar. The letter's system prompt (~1.4k tokens)
// does; the reply's (~450) does not, which is a second reason the reply is the
// one that moved to the cheap model instead.
export const CACHEABLE_SYSTEM = { type: "ephemeral" } as const;
