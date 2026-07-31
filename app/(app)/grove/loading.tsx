import { Screen, Skeleton } from "@/components/ui";

// The tree reads outside the fourteen-day window, so this screen's queries are
// the widest in the app — it's the one that most needs a frame to arrive into.
// A tree-shaped block, not a spinner: a spinner says "waiting", a frame the
// right shape says "here, nearly".
export default function Loading() {
  return (
    <Screen className="space-y-10">
      <Skeleton className="h-3 w-36" />
      <div className="space-y-3" aria-hidden>
        <Skeleton className="mx-auto h-[15rem] w-full max-w-[16rem] rounded-3xl" />
        <Skeleton className="mx-auto h-3 w-4/5" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="space-y-4" aria-hidden>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Screen>
  );
}
