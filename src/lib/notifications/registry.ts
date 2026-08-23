import { emailProvider } from "@/lib/notifications/providers/email";
import { loggingProvider } from "@/lib/notifications/providers/logging";
import { pushProvider } from "@/lib/notifications/providers/push";
import type { NotificationChannel, NotificationProvider } from "@/lib/notifications/types";
import { serverEnv } from "@/lib/env";

/**
 * The one place a real provider gets swapped in later (§9.1). sms/whatsapp
 * always use the safe default — this session's explicit scope decision, not
 * a placeholder. email/push use it too whenever their environment is not
 * configured, so an unconfigured deployment degrades honestly instead of
 * crashing.
 */
export function getProvider(channel: NotificationChannel): NotificationProvider {
  const env = serverEnv();

  if (channel === "email" && env.SMTP_HOST && env.SMTP_PORT && env.SMTP_FROM) {
    return emailProvider(env.SMTP_HOST, env.SMTP_PORT, env.SMTP_FROM);
  }

  if (channel === "push" && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    return pushProvider(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT);
  }

  return loggingProvider(channel);
}
