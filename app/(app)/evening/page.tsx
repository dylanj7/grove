import { Screen, Eyebrow } from "@/components/ui";
import CheckinForm from "./checkin-form";

// The evening check-in — the one place you give something to Grove. The
// metaphor is carving your own words into the clearing. The form reads today's
// state (by local day) and owns its own headings per state.
export default function EveningPage() {
  return (
    <Screen>
      <Eyebrow primary="This evening" secondary="The check-in" />
      <CheckinForm />
    </Screen>
  );
}
