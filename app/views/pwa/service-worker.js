self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open("wechat-rails-shell-v1");
    await cache.addAll([
      "/chat",
      "/icon-180.png",
      "/icon-192.png",
      "/icon.png"
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(event.request);
      } catch (_) {
        const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (clients.length > 0) {
          return Response.redirect("/chat", 302);
        }
        return caches.match("/chat");
      }
    })());
    return;
  }

  if (!/\.(png|svg|jpg|jpeg|webp|gif)$/i.test(url.pathname)) {
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      return cached;
    }

    const response = await fetch(event.request);
    const cache = await caches.open("wechat-rails-assets-v1");
    cache.put(event.request, response.clone());
    return response;
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/chat";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    const matchingClient = allClients.find((client) => {
      return client.url.includes("/chat");
    });

    if (matchingClient) {
      await matchingClient.focus();
      matchingClient.postMessage({
        type: "OPEN_CHAT_ROOM",
        url: targetUrl
      });
      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});
