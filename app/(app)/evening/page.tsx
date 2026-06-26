import { createClient } from "@/lib/supabase/server";
import { Screen, Eyebrow, Voice } from "@/components/ui";
import { todayISO } from "@/lib/date";
import CheckinForm from "./checkin-form";

// The evening check-in — the one place you give something to Grove. The
// metaphor is carving your own words into the clearing.
export default async function EveningPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("checkins")
    .select("mood, energy, focus, note_text")
    .eq("user_id", user!.id)
    .eq("day", todayISO())
    .maybeSingle();

  return (
    <Screen>
      <Eyebrow primary="This evening" secondary="The check-in" />
      <Voice className="mt-8 text-[1.4rem]">How did the day go?</Voice>
      <CheckinForm existing={existing ?? null} />
    </Screen>
  );
}
