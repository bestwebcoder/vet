import nodemailer from "nodemailer";

import type { NotificationProvider } from "@/lib/notifications/types";

/**
 * Real SMTP delivery. Points at the local Supabase Mailpit stack in
 * development (§9.1) — no third-party account needed to exercise this
 * channel end to end.
 */
export function emailProvider(host: string, port: number, from: string): NotificationProvider {
  const transport = nodemailer.createTransport({ host, port, secure: false });

  return {
    async send(payload) {
      try {
        const info = await transport.sendMail({
          from,
          to: payload.to,
          subject: payload.subject ?? "Notification",
          text: payload.body,
        });

        return { success: true, providerMessageId: info.messageId };
      } catch (error) {
        console.error("[notifications] email send failed", error);
        return { success: false, reason: "email delivery failed", retryable: true };
      }
    },
  };
}
