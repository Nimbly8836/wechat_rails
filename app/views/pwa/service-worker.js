self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
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
