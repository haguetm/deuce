/*
 * Service worker: Web Push reminders only (no offline cache).
 * Payload: { title, body, url } built by /api/push/dispatch.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "", {
      body: data.body || "",
      icon: "/brand/mark.svg",
      badge: "/brand/mark.svg",
      data: { url: data.url || "/" },
      tag: data.tag || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).pathname === url && "focus" in client)
            return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
