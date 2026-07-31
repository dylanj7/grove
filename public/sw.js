// public/sw.js
// ---------------------------------------------------------------------------
// Grove's service worker. It does exactly one job: receive a push and show it.
//
// THERE IS NO `fetch` HANDLER, AND THAT IS THE DESIGN.
//
// The reflex when adding a service worker is to also add offline caching, and
// for this app that would be actively harmful. Grove's screens are Server
// Components rendered from a fourteen-day window; a cached HTML shell would
// serve yesterday's letter, yesterday's body reading, and yesterday's
// intentions with no indication that it was doing so. The one thing this
// product cannot afford is to say something false confidently — and a stale
// cache is a machine for doing precisely that. Being offline is instead named
// out loud, in the app, by components/offline-note.tsx.
//
// So: no fetch interception, no precache, no cache storage at all. Registering
// this worker changes nothing about how any page loads. It only makes the
// browser willing to hold a push subscription.
//
// Kept in /public as plain JS rather than built: a service worker's SCOPE is
// its own URL path, so it must be served from the origin root to be allowed to
// receive pushes for the whole app.
// ---------------------------------------------------------------------------

// Take over immediately rather than waiting for every tab to close. A worker
// whose only behavior is "show a notification" has no version-skew risk to
// protect against, and waiting would mean a freshly-enabled subscription
// silently not working until the app was fully quit.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  // A push with no payload, or an unparseable one, is not shown. Some browsers
  // require that a push event result in a visible notification, but showing
  // "Grove" with no body would be a ping with nothing to say — the exact thing
  // lib/nudges.ts exists to prevent — so an empty push is dropped on purpose.
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || !payload.title) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // The collapse key. A newer nudge REPLACES an unread older one instead of
      // stacking beneath it: three unanswered Grove notifications on a lock
      // screen read as an app that nags, whatever each one says.
      tag: payload.tag || "grove",
      renotify: false,
      // Never vibrate-and-sound a reflection prompt. It is not urgent and
      // pretending otherwise is how an app earns being muted.
      silent: false,
      requireInteraction: false,
      data: { url: payload.url || "/home" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/home";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an already-open Grove and navigate it, rather than opening a
      // second window. On an installed PWA a second window is a second app.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // Navigation can be refused mid-lifecycle; a focused Grove on the
              // wrong screen still beats a new window.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
