"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CloudOff } from "lucide-react";

// OFFLINE, said once, quietly.
//
// Grove is installable, so it WILL be opened on a train. Without this, going
// offline is invisible until something fails: a tend reverts with "didn't save",
// the letter falls back to the deterministic read with no explanation, and the
// screen shows a fourteen-day window that is however old the last load was.
// Each of those individually looks like the app being wrong — which is the one
// impression this product cannot afford, since its whole claim is that it only
// says true things.
//
// So the connection is named, and the consequence is stated in one clause. It
// sits above the tab bar rather than at the top of the screen: an offline
// notice that pushes the letter down is a bigger interruption than the fact
// deserves.
//
// useSyncExternalStore rather than an effect + state, so the server snapshot is
// explicitly "online" and there is no hydration flash of a banner that isn't
// true yet.
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export default function OfflineNote() {
  const getSnapshot = useCallback(() => navigator.onLine, []);
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true);

  if (online) return null;

  return (
    <div
      role="status"
      className="grove-fade pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-5"
    >
      <p className="flex items-center gap-2 rounded-full border border-sage/70 bg-bark px-4 py-2 text-[0.74rem] text-pine shadow-soft">
        <CloudOff size={14} aria-hidden className="shrink-0 text-canopy" />
        Offline — showing what Grove already had.
      </p>
    </div>
  );
}
