import type { NotificationChannel } from "@/lib/notifications/types";

/** Replaces `{{var}}` placeholders; an unknown placeholder is left as-is. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

type Notification = { title: string; body: string | null };
type Template = { subjectTemplate: string | null; bodyTemplate: string } | null;

/**
 * Templates are an optional override (§9.6) — with none active for this
 * (org, type, channel), the notification's own title/body (already scoped
 * and never hardcoded — see the trigger functions in
 * 20260826000100_vaccination_deworming.sql and
 * 20260827000100_billing.sql) are sent as-is.
 */
export function buildContent(
  notification: Notification,
  channel: NotificationChannel,
  template: Template,
): { subject?: string; body: string } {
  const vars = { title: notification.title, body: notification.body ?? "" };

  if (!template) {
    return channel === "email"
      ? { subject: notification.title, body: notification.body ?? notification.title }
      : { body: notification.body ? `${notification.title}: ${notification.body}` : notification.title };
  }

  return {
    subject: template.subjectTemplate ? renderTemplate(template.subjectTemplate, vars) : notification.title,
    body: renderTemplate(template.bodyTemplate, vars),
  };
}
