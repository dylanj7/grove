# The nudge schedule, and why it looks like that

`vercel.json` runs `/api/nudges/run` **once a day at 16:00 UTC**.

## Why daily and not hourly

Hourly would be better, and the code is already written for it: every gate that
matters (`WEEKLY_CAP`, `COOLDOWN_DAYS`, `MIN_GAP_HOURS`, `isCivilHour`) lives in
`lib/nudges.ts`, so the route is safe to run at any cadence and behaves the same.
The schedule is a deployment detail, not a trigger.

The reason it's daily is that **Vercel's Hobby plan only permits cron jobs that
fire once per day**. On Pro, change the schedule to `0 * * * *` and nothing else
needs to change — `isCivilHour` will pick the first decent local hour for each
device, and `MIN_GAP_HOURS` keeps it to at most one a day per person.

## The cost of daily: some timezones

16:00 UTC lands inside the 09:00–21:00 local civil window for roughly UTC−7
through UTC+5 — the Americas, Europe, Africa, western Asia. A device further
east than about UTC+5 is asleep at 16:00 UTC and is skipped, so on the Hobby
schedule those users will effectively never be nudged.

That is a real limitation, and it is the honest tradeoff of a single daily run.
Pick the hour that suits where you actually are, or go hourly on Pro.

## Required environment variables

| Name | Where | What it's for |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Vercel + `.env.local` | Handed to the browser when it subscribes |
| `VAPID_PRIVATE_KEY` | Vercel + `.env.local` | Signs each push. Secret. |
| `VAPID_SUBJECT` | optional | `mailto:` contact the push service can reach |
| `CRON_SECRET` | Vercel | Vercel Cron sends it as `Authorization: Bearer …`. **Without it the route returns 401 to everyone**, which is the intended failure direction. |
| `SUPABASE_SECRET_KEY` | already set | The sender reads across accounts |

Generate a VAPID pair with:

```
npx web-push generate-vapid-keys
```

## Testing it by hand

```
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-deploy>/api/nudges/run
```

It answers `{ ok, considered, sent, pruned }` and never leaks who. `considered`
counting people while `sent` stays 0 is the normal, correct result: it means
nobody's data said anything worth an interruption.
