// lib/push.ts
// ----------------------------------------------------------------
// Web Push delivery. The seam between "Grove decided to say something"
// (lib/nudges.ts) and "a phone buzzed" — everything above this line is
// source-blind about transport, the same way lib/health.ts is about providers.
//
// WHY WEB PUSH AND NOT A NATIVE PUSH SDK. Grove is a web app installed to the
// home screen. Since iOS 16.4, a PWA added to the Home Screen can receive Web
// Push exactly like an Android or desktop browser can — so the whole of §3.4
// ships without a native shell. The one real constraint is Apple's, and it is
// worth knowing: on iOS the user must have INSTALLED the app to the Home Screen
// first; a Grove open in a Safari tab cannot be granted notification permission
// at all. The settings UI says that out loud rather than showing a button that
// silently does nothing.
//
// This module is Node-only (web-push signs the VAPID JWT with node:crypto), so
// every route that imports it must declare runtime = "nodejs".
// ----------------------------------------------------------------

import webpush from "web-push";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** What a notification carries. The service worker reads exactly these keys. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** Collapse key: a newer nudge replaces an unread older one on the lock
   *  screen rather than stacking. Grove is never allowed to become a pile. */
  tag: string;
};

const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:hello@grove.app";

/**
 * The VAPID public key, safe to hand to the browser — it is half of the pair
 * the push service uses to check that a push claiming to be from this origin
 * really is. Returned to the client so subscribing needs no NEXT_PUBLIC_ env
 * var: the settings screen is a Server Component and can simply pass it down.
 */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured() {
  if (configured) return;
  webpush.setVapidDetails(SUBJECT, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** What became of one delivery attempt. `gone` means: delete this row. */
export type SendResult = "sent" | "gone" | "failed";

/**
 * Send to one device.
 *
 * Never throws. A dead endpoint is the normal end of a subscription's life —
 * the browser was uninstalled, the profile cleared, the push service rotated it
 * — and the push service reports that as 404 or 410. Treating it as an error
 * would mean one stale row poisoning every future run for that user.
 */
export async function sendPush(
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<SendResult> {
  if (!pushConfigured()) return "failed";
  ensureConfigured();

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      {
        // A nudge is about today. If the device has been off for a day, the
        // fact that prompted it has probably moved on, and delivering it stale
        // is worse than not delivering it.
        TTL: 6 * 60 * 60,
        urgency: "normal",
      },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("push send failed:", status ?? "", (err as Error)?.message);
    return "failed";
  }
}
