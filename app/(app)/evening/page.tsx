import { redirect } from "next/navigation";

// The evening check-in folded into the single slot-aware /checkin flow (Phase
// 4.5). Kept as a redirect so any saved link or muscle-memory path still lands.
export default function EveningRedirect() {
  redirect("/checkin");
}
