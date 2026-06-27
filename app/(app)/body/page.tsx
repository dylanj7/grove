import { redirect } from "next/navigation";

// The standalone body screen folded into the morning check-in (Phase 4.5 §1a):
// sleep + felt state + the day ahead are one morning flow now. The physical
// reading still lives in the data model and still feeds recovery and the brief —
// only the input surface moved. Kept as a redirect so old links still land.
export default function BodyRedirect() {
  redirect("/checkin");
}
