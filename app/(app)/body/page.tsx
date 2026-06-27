import { Screen, Eyebrow } from "@/components/ui";
import BodyForm from "./body-form";

// The body's half of "how today went". The evening check-in records the mind;
// this records the body — sleep and heart, by hand. Manual input is first-class
// and permanent: Grove reads the body honestly with no wearable connected. When
// Fitbit arrives (Phase 5) it simply becomes another way to fill this in.
export default function BodyPage() {
  return (
    <Screen>
      <Eyebrow primary="The body" secondary="Today" />
      <div className="mt-8">
        <BodyForm />
      </div>
    </Screen>
  );
}
