import { buildContent } from "@/lib/notifications/render";
import { getProvider } from "@/lib/notifications/registry";
import { isWithinQuietHours, nextAllowedSendTime } from "@/lib/notifications/quiet-hours";
import type { NotificationChannel, SendResult } from "@/lib/notifications/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The dispatcher (§9.3). Not a persistent worker — a plain function called
 * either directly (tests) or via POST /api/notifications/process, which an
 * external scheduler is expected to hit every few minutes in production
 * (see that route for the exact integration point).
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];

export type ProcessSummary = {
  processed: number;
  sent: number;
  deferred: number;
  retrying: number;
  failed: number;
};

type Row = {
  id: string;
  organization_id: string;
  recipient_user_id: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  retry_count: number;
  recipient: { email: string; phone: string | null } | { email: string; phone: string | null }[] | null;
  organization: {
    timezone: string;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
  } | { timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function processScheduledNotifications(limit = 50): Promise<ProcessSummary> {
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();
  const summary: ProcessSummary = { processed: 0, sent: 0, deferred: 0, retrying: 0, failed: 0 };

  const { data: rows, error } = await supabase
    .from("notifications")
    .select(
      `id, organization_id, recipient_user_id, type, channel, title, body, retry_count,
       recipient:users (email, phone),
       organization:organizations (timezone, quiet_hours_start, quiet_hours_end)`,
    )
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[notifications] dispatch query failed", error);
    return summary;
  }

  for (const raw of rows ?? []) {
    const row = raw as unknown as Row;
    summary.processed += 1;

    const recipient = one(row.recipient);
    const organization = one(row.organization);
    const now = new Date();

    if (
      row.channel !== "email" &&
      organization &&
      isWithinQuietHours(organization.quiet_hours_start, organization.quiet_hours_end, organization.timezone, now)
    ) {
      const rescheduledFor = nextAllowedSendTime(organization.quiet_hours_end as string, organization.timezone, now);
      await supabase.from("notifications").update({ scheduled_for: rescheduledFor.toISOString() }).eq("id", row.id);
      await supabase
        .from("notification_logs")
        .insert({ notification_id: row.id, event: "scheduled", detail: "deferred for quiet hours" });
      summary.deferred += 1;
      continue;
    }

    const { data: templateRow } = await supabase
      .from("notification_templates")
      .select("subject_template, body_template")
      .eq("organization_id", row.organization_id)
      .eq("type", row.type)
      .eq("channel", row.channel)
      .eq("is_active", true)
      .maybeSingle();

    const template = templateRow
      ? { subjectTemplate: templateRow.subject_template, bodyTemplate: templateRow.body_template }
      : null;
    const content = buildContent({ title: row.title, body: row.body }, row.channel, template);

    const result = await sendToChannel(supabase, row.channel, row.recipient_user_id, recipient, content);

    if (result.success) {
      await supabase
        .from("notifications")
        .update({ status: "sent", sent_at: now.toISOString(), provider_message_id: result.providerMessageId ?? null })
        .eq("id", row.id);
      await supabase.from("notification_logs").insert({
        notification_id: row.id,
        event: "sent",
        detail: content.subject ?? content.body,
        provider_message_id: result.providerMessageId ?? null,
      });
      summary.sent += 1;
      continue;
    }

    const attempt = row.retry_count + 1;
    if (result.retryable && attempt < MAX_ATTEMPTS) {
      const nextRetryAt = new Date(now.getTime() + BACKOFF_MINUTES[row.retry_count] * 60_000);
      await supabase
        .from("notifications")
        .update({ retry_count: attempt, next_retry_at: nextRetryAt.toISOString() })
        .eq("id", row.id);
      await supabase.from("notification_logs").insert({ notification_id: row.id, event: "retrying", detail: result.reason });
      summary.retrying += 1;
    } else {
      await supabase
        .from("notifications")
        .update({ status: "failed", retry_count: attempt, failure_reason: result.reason })
        .eq("id", row.id);
      await supabase.from("notification_logs").insert({ notification_id: row.id, event: "failed", detail: result.reason });
      summary.failed += 1;
    }
  }

  return summary;
}

/**
 * Email/sms/whatsapp send to one destination on the user's profile. Push has
 * none of its own — it sends to every subscription (device/browser) the
 * user has enabled, succeeding if any one of them accepts the notification.
 */
async function sendToChannel(
  supabase: SupabaseClient,
  channel: NotificationChannel,
  recipientUserId: string,
  recipient: { email: string; phone: string | null } | null,
  content: { subject?: string; body: string },
): Promise<SendResult> {
  if (channel === "push") {
    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipientUserId);

    if (!subscriptions || subscriptions.length === 0) {
      return { success: false, reason: "no push subscription on file", retryable: false };
    }

    const provider = getProvider("push");
    let last: SendResult = { success: false, reason: "push delivery failed", retryable: true };

    for (const subscription of subscriptions) {
      const to = JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      });
      const result = await provider.send({ to, subject: content.subject, body: content.body });
      if (result.success) return result;
      last = result;
    }

    return last;
  }

  if (!recipient) return { success: false, reason: "no recipient on file", retryable: false };

  const to = channel === "email" ? recipient.email : recipient.phone;
  if (!to) {
    return {
      success: false,
      reason: `no ${channel === "email" ? "email address" : "phone number"} on file`,
      retryable: false,
    };
  }

  return getProvider(channel).send({ to, subject: content.subject, body: content.body });
}
