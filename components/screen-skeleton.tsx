import { Screen, Skeleton } from "@/components/ui";

// The shape of a screen that hasn't arrived yet.
//
// This exists because of what a tab tap used to feel like: the old screen stayed
// on-screen, frozen, for as long as the next one's queries took, and then it
// swapped. Nothing acknowledged the tap. That reads as a slow app even when the
// query is fast, because the feedback loop is open the whole time.
//
// With a loading.tsx at each route, the tap paints instantly — the crossfade
// runs immediately into a frame the right shape, and the real content replaces
// it when it lands. Blocks the size of the content, never a spinner: a spinner
// says "waiting", a skeleton says "here, nearly".
export default function ScreenSkeleton({
  rows = 3,
  chart = false,
}: {
  rows?: number;
  chart?: boolean;
}) {
  return (
    <Screen className="space-y-8">
      <Skeleton className="h-3 w-36" />

      <div className="space-y-3" aria-hidden>
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-10/12" />
      </div>

      {chart && <Skeleton className="h-56 w-full rounded-2xl" />}

      <div className="space-y-3" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    </Screen>
  );
}
