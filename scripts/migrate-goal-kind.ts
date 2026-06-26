// One-off: convert any legacy goals with kind 'milestone' to the literal 'goal'.
// Safe and idempotent — re-running it is a no-op once nothing remains.
//
//   npx tsx scripts/migrate-goal-kind.ts

import { createClient } from "@supabase/supabase-js";

const loadEnvFile = (process as unknown as { loadEnvFile?: (p: string) => void })
  .loadEnvFile;
try {
  loadEnvFile?.(".env.local");
} catch {
  // rely on already-exported env
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: legacy, error: readErr } = await supabase
    .from("goals")
    .select("id")
    .eq("kind", "milestone");
  if (readErr) {
    console.error("read failed:", readErr.message);
    process.exit(1);
  }

  const count = legacy?.length ?? 0;
  console.log(`found ${count} row(s) with kind='milestone'.`);
  if (count === 0) {
    console.log("nothing to migrate.");
    return;
  }

  const { data, error } = await supabase
    .from("goals")
    .update({ kind: "goal" })
    .eq("kind", "milestone")
    .select("id");

  if (error) {
    console.error("\nUPDATE failed:", error.message);
    console.error(
      "A CHECK constraint or enum likely restricts `kind`. Run the SQL from chat\n" +
        "in the Supabase SQL editor, then re-run this script.",
    );
    process.exit(1);
  }
  console.log(`✓ migrated ${data?.length ?? 0} row(s): 'milestone' → 'goal'.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
