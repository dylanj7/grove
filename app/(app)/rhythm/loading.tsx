import ScreenSkeleton from "@/components/screen-skeleton";

// The heaviest screen in the app — the tree reads outside the window and the
// chart needs the whole fourteen days — so it is the one that most needed a
// frame to arrive into.
export default function Loading() {
  return <ScreenSkeleton chart rows={2} />;
}
