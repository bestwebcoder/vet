"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/features/auth/session";
import { processScheduledNotifications } from "@/features/notifications/process";
import { failure, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/**
 * Client-owned preference and push-subscription actions (§9.4), plus the
 * admin's manual "retry now" for a failed send. Every write here is scoped
 * to the caller's own row by row level security — no organization-scoped
 * checks are needed in the action itself.
 */

const CHANNELS = ["email", "sms", "whatsapp", "push"] as const;

/** `currentlyEnabled` carries the state before this click; the action flips it. */
export async function updatePreferenceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const userId = text(formData, "userId");
  const type = text(formData, "type");
  const channel = text(formData, "channel");
  const currentlyEnabled = text(formData, "currentlyEnabled") === "true";

  if (!userId || !type || !channel || !CHANNELS.includes(channel as (typeof CHANNELS)[number])) {
    return { status: "error", message: "We could not tell which preference to update." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: userId, type, channel, enabled: !currentlyEnabled },
      { onConflict: "user_id,type,channel" },
    );

  if (error) return failure("notifications", error, "We could not save that preference just now. Please try again.");

  revalidatePath("/client/notifications");
  return { status: "success" };
}

export async function subscribeToPushAction(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: "user_id,endpoint" },
  );

  if (error) return failure("notifications", error, "We could not enable push notifications just now. Please try again.");

  revalidatePath("/client/notifications");
  return { status: "success", message: "Push notifications enabled on this device." };
}

export async function unsubscribeFromPushAction(endpoint: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  if (error) return failure("notifications", error, "We could not disable push notifications just now. Please try again.");

  revalidatePath("/client/notifications");
  return { status: "success", message: "Push notifications disabled on this device." };
}

/** Admin's manual retry — resets the backoff so the next dispatch picks the row up immediately. */
export async function retryNotificationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const notificationId = text(formData, "notificationId");
  if (!notificationId) return { status: "error", message: "We could not tell which notification to retry." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ status: "scheduled", retry_count: 0, next_retry_at: null, failure_reason: null })
    .eq("id", notificationId)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();

  if (error) return failure("notifications", error, "We could not retry that notification just now. Please try again.");
  if (!data) return { status: "error", message: "That notification is not in a failed state." };

  revalidatePath("/admin/notifications");
  return { status: "success", message: "Queued for retry." };
}

/**
 * Manual trigger for local/ops verification — production dispatch is
 * expected to come from an external scheduler hitting
 * POST /api/notifications/process instead (see that route). This calls the
 * same dispatcher function directly, admin-gated in application code since
 * it runs under the service role and bypasses row level security.
 */
export async function processNotificationsNowAction(): Promise<FormState> {
  await requireRole("admin", "super_admin");

  const summary = await processScheduledNotifications();

  revalidatePath("/admin/notifications");
  return {
    status: "success",
    message: `Processed ${summary.processed}: ${summary.sent} sent, ${summary.deferred} deferred, ${summary.retrying} retrying, ${summary.failed} failed.`,
  };
}
