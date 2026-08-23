"use client";

import { publicEnv } from "@/lib/env";

/** Web Push needs the VAPID public key as a raw byte array, not base64url text. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** The current subscription for this browser, if any. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js");
  return registration.pushManager.getSubscription();
}

/** Registers the service worker and subscribes this browser to push, prompting for permission. */
export async function subscribeToPush(): Promise<PushSubscription> {
  const { NEXT_PUBLIC_VAPID_PUBLIC_KEY } = publicEnv();
  if (!NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    throw new Error("Push notifications are not configured for this deployment.");
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  });
}

export function subscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } };
}
