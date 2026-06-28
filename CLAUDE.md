@AGENTS.md

# The band (Phase 5 — Google Health)

Wearable data flows in behind the provider-neutral seam: `lib/health.ts` (the
hinge — token store, refresh, the lazy per-day sync, connect/disconnect) and
`lib/health-google.ts` (every Google-specific detail — OAuth params, scope
strings, the v4 API). Everything above the seam stays source-blind. The token
table is `health_connections` (was `fitbit_connections`); a `physical_days` row
now carries a `source`, and a day can hold both a `manual` and a `google_health`
row, merged provider-over-manual per metric in `lib/window.ts`.

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
