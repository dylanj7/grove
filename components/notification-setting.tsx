"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { NUDGE_PROMISE } from "@/lib/nudges";

// ============================================================================
// NOTIFICATIONS — the setting that used to say "LATER".
// ----------------------------------------------------------------------------
// The instinct behind that placeholder was right: a daily reminder is what gets
// this category of app deleted. So the thing being switched on here is NOT
// "notifications" in the usual sense. It is a subscription to a detector
// (lib/nudges.ts) that is structurally incapable of firing on a schedule —
// every message it can send is downstream of a specific change in the user's
// own data, capped at three a week, at most one a day, and never outside 9–21
// local. The promise is stated on the card because being able to state it is
// the entire reason the feature is worth having.
//
// EVERY UNAVAILABLE STATE IS NAMED, WITH ITS REASON. The hard one is iOS: Web
// Push works on iPhone only for a PWA that has been ADDED TO THE HOME SCREEN —
// in a Safari tab the Notification API is not merely denied, it is absent. A
// toggle that silently does nothing there would be the app lying about its own
// capabilities on the screen where it explains itself, so that case gets a
// sentence telling the user exactly what to do instead.
// ============================================================================

type State =
  | "checking"
  | "unsupported"   // not a browser that does this at all
  | "needs_install" // iOS, not yet added to the Home Screen
  | "unconfigured"  // no VAPID keys on this deployment
  | "denied"        // the OS-level permission was refused
  | "off"
  | "on";

// The VAPID key travels as base64url; PushManager wants raw bytes.
//
// Typed as Uint8Array<ArrayBuffer> rather than plain Uint8Array on purpose:
// since TS 5.7 the default type parameter is ArrayBufferLike, which includes
// SharedArrayBuffer, and applicationServerKey requires a BufferSource backed by
// a real ArrayBuffer. Allocating the buffer explicitly states the narrower type
// instead of casting it away.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOS(): boolean {
  // navigator.platform is deprecated and iPadOS reports itself as a Mac, so the
  // touch-point check is the part that catches an iPad.
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))
  );
}

function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function NotificationSetting({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        typeof Notification !== "undefined";

      if (!supported) {
        // On iOS the whole API is missing until the app is installed, so
        // "unsupported" there is almost always the wrong diagnosis.
        if (!cancelled) setState(isIOS() && !isInstalled() ? "needs_install" : "unsupported");
        return;
      }
      if (!vapidPublicKey) {
        if (!cancelled) setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      // Is this device already subscribed? Read it from the browser rather than
      // from our own table: the browser is the authority on whether a
      // subscription exists, and a row that outlived it would show "on" for a
      // device that can no longer be reached.
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const existing = await reg?.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setState("off");
    });

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const enable = useCallback(async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      // Registered on demand, not on every page load. The worker's only job is
      // to receive a push (see public/sw.js — it has no fetch handler on
      // purpose), so there is nothing to gain from installing it for someone
      // who never turns this on.
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          // Required to be true by every browser that implements this: a push
          // must always result in something the user can see.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: json.keys,
          // The device's own offset, so the sender knows what time it is where
          // this phone is and never rings it at 3am.
          tzOffset: new Date().getTimezoneOffset(),
        }),
      });
      if (!res.ok) throw new Error("subscribe failed");

      setState("on");
    } catch {
      setNote("That didn't go through. Nothing changed.");
      setState("off");
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Tell the server first: if unsubscribing succeeds and the delete
        // fails, the sender keeps pushing at an endpoint nobody is listening
        // to. The other order just leaves a row to be pruned on first send.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setNote("Couldn't turn those off just now.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.95rem] text-pine">When something changes</p>
          <p className="mt-1 text-[0.78rem] leading-relaxed text-canopy">{NUDGE_PROMISE}</p>
        </div>
        {state === "on" ? (
          <BellRing size={16} aria-hidden className="mt-1 shrink-0 text-viz-body" />
        ) : null}
      </div>

      {state === "checking" ? (
        <p className="text-[0.75rem] text-canopy/70">Checking this device&hellip;</p>
      ) : state === "on" || state === "off" ? (
        <button
          type="button"
          onClick={state === "on" ? disable : enable}
          disabled={busy}
          className="grove-press inline-flex min-h-[40px] items-center gap-2 py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-moss hover:text-pine focus-visible:underline focus-visible:outline-none disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} aria-hidden className="animate-spin" /> : null}
          {state === "on" ? "Turn off on this device" : "Turn on for this device"}
        </button>
      ) : (
        <p className="text-[0.78rem] leading-relaxed text-canopy">{UNAVAILABLE[state]}</p>
      )}

      {note ? <p className="text-[0.78rem] leading-relaxed text-soil">{note}</p> : null}
    </div>
  );
}

// Each of these says what is true and, where there is one, what to do about it.
// None of them is "notifications are unavailable" — that sentence tells a person
// nothing and is the reason unsupported states feel like bugs.
const UNAVAILABLE: Record<
  Exclude<State, "checking" | "on" | "off">,
  string
> = {
  needs_install:
    "Add Grove to your Home Screen first — on iPhone, notifications only work once the app is installed. Share → Add to Home Screen, then come back here.",
  denied:
    "Your browser is blocking notifications for Grove. You can change that in its site settings; nothing here can override it.",
  unsupported: "This browser can't receive notifications. Grove on your phone can.",
  unconfigured: "Notifications aren't set up on this deployment yet.",
};
