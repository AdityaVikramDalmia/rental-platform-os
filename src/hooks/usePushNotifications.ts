"use client";

// Wire into guard/admin settings when push notification UI is built (P35-E04 follow-up)

import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

type PushState = {
  supported: boolean;
  permission: NotificationPermission;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.length);
  const view = new Uint8Array(buffer);
  view.set(bytes);
  return buffer;
}

export function usePushNotifications() {
  const subscribe = useMutation(api.notifications.registerPushSubscription);
  const unsubscribe = useMutation(api.notifications.unregisterPushSubscription);

  function getState(): PushState {
    const supported =
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    const permission = typeof Notification !== "undefined" ? Notification.permission : "default";

    return { supported, permission };
  }

  async function enable(): Promise<{ success: boolean; reason?: string }> {
    const state = getState();

    if (!state.supported) {
      return { success: false, reason: "unsupported" };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, reason: "permission_denied" };
    }

    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      return { success: false, reason: "missing_vapid_public_key" };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToArrayBuffer(vapidPublicKey),
    });

    const subscriptionJson = subscription.toJSON();
    const endpoint = subscription.endpoint;
    const p256dh = subscriptionJson.keys?.p256dh;
    const auth = subscriptionJson.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return { success: false, reason: "invalid_subscription_payload" };
    }

    await subscribe({
      endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      device_fingerprint: `${navigator.userAgent}:${navigator.language}`,
    });

    return { success: true };
  }

  async function disable(): Promise<{ success: boolean }> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return { success: true };
    }

    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    if (!current) {
      return { success: true };
    }

    const endpoint = current.endpoint;
    await current.unsubscribe();
    await unsubscribe({ endpoint });
    return { success: true };
  }

  return {
    getState,
    enable,
    disable,
  };
}
