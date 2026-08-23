import type { NotificationChannel } from "@/lib/notifications/types";

/**
 * The full set of notification types (Phase 6's original six, plus §9.2's
 * three new transactional ones) and channels — shared by server queries and
 * client-side forms, so neither can drift from `notifications_type_allowed`
 * in 20260826000100_vaccination_deworming.sql /
 * 20260829000100_notifications.sql.
 */

export const NOTIFICATION_TYPES = [
  "appointment_reminder",
  "vaccination_reminder",
  "deworming_reminder",
  "follow_up_reminder",
  "invoice_reminder",
  "payment_confirmation",
  "appointment_confirmation",
  "prescription_available",
  "invoice_issued",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  appointment_reminder: "Appointment reminders",
  vaccination_reminder: "Vaccination due reminders",
  deworming_reminder: "Deworming due reminders",
  follow_up_reminder: "Follow-up reminders",
  invoice_reminder: "Invoice due reminders",
  payment_confirmation: "Payment confirmations",
  appointment_confirmation: "Appointment confirmations",
  prescription_available: "New prescriptions",
  invoice_issued: "New invoices",
};

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["email", "sms", "whatsapp", "push"];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};
