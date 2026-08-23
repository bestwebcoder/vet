// Minimal service worker for Web Push (§9.1). Shows whatever the server
// sent and focuses the app on click — no caching, no offline support, this
// is not a PWA shell.

self.addEventListener("push", (event) => {
  let payload = { title: "TV Care", body: "You have a new notification." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to the default above.
  }

  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    }),
  );
});
