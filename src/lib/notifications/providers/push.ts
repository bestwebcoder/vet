import * as webpush from "web-push";

import type { NotificationProvider } from "@/lib/notifications/types";

/**
 * Real Web Push delivery via VAPID — no third-party account needed (§9.1).
 * `payload.to` is a JSON-encoded `PushSubscription`
 * (`{endpoint, keys: {p256dh, auth}}`), one per browser/device a user has
 * enabled push on.
 */
export function pushProvider(publicKey: string, privateKey: string, subject: string): NotificationProvider {
  webpush.setVapidDetails(subject, publicKey, privateKey);

  return {
    async send(payload) {
      let subscription: webpush.PushSubscription;
      try {
        subscription = JSON.parse(payload.to);
      } catch {
        return { success: false, reason: "invalid push subscription", retryable: false };
      }

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({ title: payload.subject ?? "Notification", body: payload.body }),
        );
        return { success: true };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the subscription itself is gone (the browser expired
        // it) — retrying will never succeed; anything else is transient.
        const retryable = statusCode !== 404 && statusCode !== 410;
        console.error("[notifications] push send failed", error);
        return { success: false, reason: "push delivery failed", retryable };
      }
    },
  };
}
