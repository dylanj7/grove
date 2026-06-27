"use client";

import { useState } from "react";
import { Screen, Eyebrow } from "@/components/ui";
import { currentSlot } from "@/lib/slot";
import CheckinFlow from "./checkin-flow";

// The check-in — the one place you give something to Grove, now twice a day. The
// slot is decided by the user's local time (morning before evening). One intake,
// two contexts: heading into the day, or looking back on it.
export default function CheckinPage() {
  const [slot] = useState(currentSlot);

  return (
    <Screen>
      <Eyebrow
        primary={slot === "morning" ? "This morning" : "This evening"}
        secondary="The check-in"
      />
      <div className="mt-8">
        <CheckinFlow slot={slot} />
      </div>
    </Screen>
  );
}
