/**
 * One interface, four implementations (email, sms, whatsapp, push) — a
 * provider can be swapped without touching the reminder engine or the
 * dispatcher, per §9.1.
 */

export type NotificationChannel = "email" | "sms" | "whatsapp" | "push";

export type SendPayload = {
  /** Email address, phone number, or push subscription JSON, depending on channel. */
  to: string;
  subject?: string;
  body: string;
};

export type SendResult =
  | { success: true; providerMessageId?: string }
  | { success: false; reason: string; retryable: boolean };

export type NotificationProvider = {
  send(payload: SendPayload): Promise<SendResult>;
};
