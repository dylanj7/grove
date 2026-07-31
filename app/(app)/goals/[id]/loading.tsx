import ScreenSkeleton from "@/components/screen-skeleton";

// The one route that still had no frame to arrive into: opening a goal's record
// left the previous screen frozen until its queries landed, which reads as a
// slow app even when the query is fast.
export default function Loading() {
  return <ScreenSkeleton rows={3} />;
}
