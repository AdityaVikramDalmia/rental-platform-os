/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  let payload:
    | {
        title?: string;
        body?: string;
        icon?: string;
        badge?: string;
        action_url?: string;
      }
    | undefined;

  try {
    payload = event.data?.json() as
      | {
          title?: string;
          body?: string;
          icon?: string;
          badge?: string;
          action_url?: string;
        }
      | undefined;
  } catch {
    payload = { title: "New Notification", body: "" };
  }

  const title = payload?.title ?? "New Notification";
  const body = payload?.body ?? "";
  const icon = payload?.icon ?? "/icons/admin-192x192.png";
  const badge = payload?.badge ?? "/icons/admin-192x192.png";
  const actionUrl = payload?.action_url ?? "/admin/notifications";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: {
        actionUrl,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const rawActionUrl =
    typeof event.notification.data?.actionUrl === "string"
      ? event.notification.data.actionUrl
      : "/";

  let actionUrl = "/";
  try {
    const parsed = new URL(rawActionUrl, self.location.origin);
    if (parsed.origin === self.location.origin) {
      actionUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    actionUrl = "/";
  }

  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => {
        const clientUrl = new URL(client.url);
        return clientUrl.pathname === actionUrl;
      });

      if (matchingClient) {
        return matchingClient.focus();
      }

      return self.clients.openWindow(actionUrl);
    }),
  );
});
