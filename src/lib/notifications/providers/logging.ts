import type { NotificationProvider } from "@/lib/notifications/types";

/**
 * The safe default for a channel with no real provider account — sms and
 * whatsapp, always; email and push, only when their environment variables
 * are absent. Never fabricates a successful send: it logs the full content
 * that would have gone out and fails honestly, so an unconfigured channel
 * shows up in the admin's failed-notifications view instead of silently
 * vanishing.
 */
export function loggingProvider(channel: string): NotificationProvider {
  return {
    async send(payload) {
      console.warn(
        `[notifications] ${channel} has no provider configured — would have sent to ${payload.to}: ${
          payload.subject ? `${payload.subject} — ` : ""
        }${payload.body}`,
      );

      return { success: false, reason: "no provider configured", retryable: false };
    },
  };
}
