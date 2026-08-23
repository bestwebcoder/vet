import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, type NotificationType } from "@/lib/notifications/catalog";
import type { NotificationChannel } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";

/** Reads for the client preferences page and the admin monitoring view. */

export type Result<T> = { status: "ok"; data: T } | { status: "error" };

export type { NotificationType } from "@/lib/notifications/catalog";

export type PreferenceMatrix = {
  type: NotificationType;
  label: string;
  channels: Record<NotificationChannel, boolean>;
}[];

/** Every (type, channel) combination for this user — absence of a stored row means enabled. */
export async function getMyNotificationPreferences(userId: string): Promise<Result<PreferenceMatrix>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("type, channel, enabled")
    .eq("user_id", userId);

  if (error) {
    console.error("[notifications] preferences read failed", error);
    return { status: "error" };
  }

  const disabled = new Set((data ?? []).filter((row) => !row.enabled).map((row) => `${row.type}:${row.channel}`));

  const matrix: PreferenceMatrix = NOTIFICATION_TYPES.map((type) => ({
    type,
    label: NOTIFICATION_TYPE_LABELS[type],
    channels: Object.fromEntries(
      NOTIFICATION_CHANNELS.map((channel) => [channel, !disabled.has(`${type}:${channel}`)]),
    ) as Record<NotificationChannel, boolean>,
  }));

  return { status: "ok", data: matrix };
}

export type FailedNotification = {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  recipientName: string | null;
  retryCount: number;
  failureReason: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- shaped by the select below */
function toFailedNotification(row: any): FailedNotification {
  const recipient = Array.isArray(row.recipient) ? row.recipient[0] : row.recipient;

  return {
    id: row.id,
    type: row.type,
    channel: row.channel,
    title: row.title,
    recipientName: recipient?.full_name ?? null,
    retryCount: row.retry_count,
    failureReason: row.failure_reason,
    scheduledFor: row.scheduled_for,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Admin monitoring view (DoD: "failed sends... surface in an admin view"). */
export async function getFailedNotifications(organizationId: string): Promise<Result<FailedNotification[]>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, channel, title, retry_count, failure_reason, scheduled_for, created_at, recipient:users (full_name)")
    .eq("organization_id", organizationId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[notifications] failed list read failed", error);
    return { status: "error" };
  }

  return { status: "ok", data: (data ?? []).map(toFailedNotification) };
}
