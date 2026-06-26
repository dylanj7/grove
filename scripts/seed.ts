// scripts/seed.ts
// ----------------------------------------------------------------
// Seeds a realistic 14-day window for the dev user so the brief has
// something honest to read. Uses the Supabase SECRET key (server
// context, bypasses RLS), so it sets user_id explicitly on every row.
// Idempotent: clears the dev user's rows first.
//
//   npx tsx scripts/seed.ts <user-id>
//   (or set SEED_USER_ID and run npx tsx scripts/seed.ts)
//
// The data is shaped to trigger, after recovery backfill at read time:
//   - sleep_dip            (last 3 nights short)
//   - low_recovery_streak  (recent recovery < 50)
//   - hrv_suppressed       (recent HRV well below baseline)
//   - focus_scattered      (last 3 check-ins low focus)
//   - energy_low           (last 2 check-ins low energy)
//   - habit_neglected      ("Morning mobility" untended 4 days)
//   - milestone_stalled    ("Ship Grove Phase 1" untouched)
//   - recovery_to_execution_chain  ← the flagship cross-pillar insight
// ----------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Next.js loads .env.local for the app, but a bare `tsx` run does not.
const loadEnvFile = (process as unknown as { loadEnvFile?: (p: string) => void })
  .loadEnvFile;
try {
  loadEnvFile?.(".env.local");
} catch {
  // No .env.local — fall back to already-exported env vars.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const userId = process.argv[2] ?? process.env.SEED_USER_ID;

if (!url || !secret) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (checked .env.local and env).",
  );
  process.exit(1);
}
if (!userId) {
  console.error(
    "Usage: npx tsx scripts/seed.ts <user-id>\n" +
      "(or set SEED_USER_ID). Find the id in Supabase → Authentication → Users.",
  );
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// days[0] = today, days[13] = 13 days ago (UTC calendar days).
function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}
const days = Array.from({ length: 14 }, (_, i) => isoDay(i));

// Recent 4 days run down (short sleep, high resting HR, low HRV, low recovery);
// the older 10 are healthy. recovery_score is left null on the older days so
// loadWindow's backfill fills them — proving backfill while still firing the
// low-recovery streak on the explicitly-low recent days.
const physical = days.map((day, i) => {
  const recent = i < 4;
  return {
    user_id: userId,
    day,
    sleep_minutes: recent ? [360, 380, 400, 390][i] : 455 + ((i * 7) % 25),
    sleep_efficiency: recent ? [83, 80, 85, 84][i] : 88 + ((i * 5) % 8),
    resting_hr: recent ? [64, 65, 63, 62][i] : 52 + (i % 4),
    hrv_ms: recent ? [40, 38, 42, 44][i] : 60 + ((i * 3) % 9),
    steps: recent ? 3800 + i * 300 : 8200 + ((i * 250) % 3000),
    active_minutes: recent ? 12 + i * 4 : 45 + ((i * 5) % 30),
    recovery_score: recent ? [38, 42, 45, 40][i] : null,
  };
});

// Last 3 check-ins: low focus (fires focus_scattered); last 2 also low energy.
const checkins = days.map((day, i) => ({
  user_id: userId,
  day,
  mood: i < 3 ? [2, 3, 3][i] : 3 + (i % 2),
  energy: i < 3 ? [2, 2, 3][i] : 3 + ((i + 1) % 2),
  focus: i < 3 ? [2, 1, 2][i] : 3 + (i % 2),
  note_text: i === 0 ? "Wiped out, hard to concentrate." : null,
}));

const mobilityId = randomUUID();
const reflectionId = randomUUID();
const milestoneId = randomUUID();

const goals = [
  {
    id: mobilityId,
    user_id: userId,
    title: "Morning mobility",
    aspect: "physical",
    horizon: "long",
    kind: "habit",
    cadence: "daily",
    progress: null,
    status: "active",
  },
  {
    id: reflectionId,
    user_id: userId,
    title: "Evening reflection",
    aspect: "mental",
    horizon: "long",
    kind: "habit",
    cadence: "daily",
    progress: null,
    status: "active",
  },
  {
    id: milestoneId,
    user_id: userId,
    title: "Ship Grove Phase 1",
    aspect: "work",
    horizon: "short",
    kind: "goal",
    cadence: null,
    progress: 35,
    status: "active",
  },
];

// Mobility: touched on the older 10 days but NOT the last 4 → habit_neglected.
// Reflection: touched the last 3 days → maintained, no flag.
// Milestone: never touched → milestone_stalled.
const touches: { user_id: string; goal_id: string; day: string }[] = [];
for (let i = 4; i < 14; i++) touches.push({ user_id: userId, goal_id: mobilityId, day: days[i] });
for (let i = 0; i < 3; i++) touches.push({ user_id: userId, goal_id: reflectionId, day: days[i] });

async function run(label: string, p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) {
    console.error(`✗ ${label}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  console.log(`Seeding 14-day window for user ${userId}…\n`);

  // Idempotent clear (touches before goals for the FK).
  await run("clear briefs", supabase.from("briefs").delete().eq("user_id", userId));
  await run("clear goal_touches", supabase.from("goal_touches").delete().eq("user_id", userId));
  await run("clear checkins", supabase.from("checkins").delete().eq("user_id", userId));
  await run("clear physical_days", supabase.from("physical_days").delete().eq("user_id", userId));
  await run("clear goals", supabase.from("goals").delete().eq("user_id", userId));

  // Insert goals first so goal_touches' FK resolves.
  await run("insert goals", supabase.from("goals").insert(goals));
  await run("insert physical_days", supabase.from("physical_days").insert(physical));
  await run("insert checkins", supabase.from("checkins").insert(checkins));
  await run("insert goal_touches", supabase.from("goal_touches").insert(touches));

  console.log(
    "\nDone. Open /debug/brief (signed in as this user) and hit a brief.\n" +
      "Expect the cross-pillar chain plus sleep/recovery/HRV, focus/energy,\n" +
      "the neglected 'Morning mobility' habit, and the stalled milestone.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
