import { createECDH, randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { admin, organizationId, runId } from "./setup/http";
import { processScheduledNotifications } from "@/features/notifications/process";

/**
 * Phase 9 · Checkpoint 2 — the dispatcher itself.
 *
 * Calls processScheduledNotifications() directly against rows seeded by
 * hand, rather than through the Phase 6 triggers (tests/notifications.test.ts
 * covers those). Every assertion below looks up its own notification by id,
 * because the shared test database can carry other suites' due
 * notifications into the same dispatch pass — this file never asserts on
 * the dispatcher's aggregate summary.
 */

const RUN = runId();

let orgA: string;
let recipientUserId: string;

function localHHmm(date: Date, timezone: string, offsetMinutes = 0): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    shifted,
  );
}

async function insertNotification(overrides: Record<string, unknown>) {
  const { data, error } = await admin
    .from("notifications")
    .insert({
      organization_id: orgA,
      recipient_user_id: recipientUserId,
      type: "payment_confirmation",
      status: "scheduled",
      scheduled_for: new Date().toISOString(),
      title: `Dispatch test ${RUN}`,
      body: "Body content for the dispatch test.",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function fetchNotification(id: string) {
  const { data, error } = await admin
    .from("notifications")
    .select("status, retry_count, next_retry_at, failure_reason, provider_message_id, scheduled_for")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  orgA = await organizationId();

  // Quiet hours are process-affecting global state on the org row — clear
  // them so the tests below that are not specifically about quiet hours
  // cannot be silently deferred by a window another suite left set.
  await admin.from("organizations").update({ quiet_hours_start: null, quiet_hours_end: null }).eq("id", orgA);

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `notif-dispatch-${RUN}@tvcare.test`,
    password: "Test-Password-123",
    email_confirm: true,
    user_metadata: { full_name: `Dispatch Recipient ${RUN}` },
  });
  if (error) throw error;
  recipientUserId = created.user.id;

  await admin.from("users").update({ phone: `+88016${RUN}77` }).eq("id", recipientUserId);
}, 60_000);

describe("email — real delivery via the local Mailpit SMTP server", () => {
  it("actually arrives, not just marked sent", async () => {
    const { data: userRow } = await admin.from("users").select("email").eq("id", recipientUserId).single();
    const notificationId = await insertNotification({ channel: "email", title: `Mailpit check ${RUN}` });

    await processScheduledNotifications(1000);

    const notification = await fetchNotification(notificationId);
    expect(notification.status).toBe("sent");
    expect(notification.provider_message_id).toBeTruthy();

    const response = await fetch(
      `http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${userRow!.email}`)}`,
    );
    const result = await response.json();
    const delivered = result.messages.find((message: { Subject: string }) => message.Subject === `Mailpit check ${RUN}`);
    expect(delivered).toBeTruthy();
  });
});

describe("sms/whatsapp — the safe default never fabricates a success", () => {
  it.each(["sms", "whatsapp"])("ends %s in a failed state with an honest reason", async (channel) => {
    const notificationId = await insertNotification({ channel });

    await processScheduledNotifications(1000);

    const notification = await fetchNotification(notificationId);
    expect(notification.status).toBe("failed");
    expect(notification.failure_reason).toBe("no provider configured");

    const { data: logs } = await admin
      .from("notification_logs")
      .select("event, detail")
      .eq("notification_id", notificationId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(logs![0]).toMatchObject({ event: "failed", detail: "no provider configured" });
  });
});

describe("push — retry with backoff, then failed after 5 attempts", () => {
  it("increments retry_count and next_retry_at on the documented schedule", async () => {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    await admin.from("push_subscriptions").insert({
      user_id: recipientUserId,
      endpoint: `https://127.0.0.1:1/unreachable-${RUN}`,
      p256dh: ecdh.getPublicKey("base64url"),
      auth: randomBytes(16).toString("base64url"),
    });

    const notificationId = await insertNotification({ channel: "push" });
    const expectedBackoffMinutes = [1, 5, 30, 120, 360];

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await processScheduledNotifications(1000);
      const notification = await fetchNotification(notificationId);

      expect(notification.status).toBe("scheduled");
      expect(notification.retry_count).toBe(attempt + 1);

      const expectedMs = expectedBackoffMinutes[attempt] * 60_000;
      const actualMs = new Date(notification.next_retry_at!).getTime() - Date.now();
      expect(Math.abs(actualMs - expectedMs)).toBeLessThan(15_000);

      // Simulate time having passed, so the next dispatch pass picks the row up.
      await admin.from("notifications").update({ next_retry_at: null }).eq("id", notificationId);
    }

    await processScheduledNotifications(1000);
    const final = await fetchNotification(notificationId);
    expect(final.status).toBe("failed");
    expect(final.retry_count).toBe(5);
    expect(final.failure_reason).toBe("push delivery failed");
  });
});

describe("quiet hours — defer sms/whatsapp/push, never email", () => {
  let organizationTimezone: string;

  beforeAll(async () => {
    const { data } = await admin.from("organizations").select("timezone").eq("id", orgA).single();
    organizationTimezone = data!.timezone;

    const now = new Date();
    await admin
      .from("organizations")
      .update({
        quiet_hours_start: localHHmm(now, organizationTimezone, -30),
        quiet_hours_end: localHHmm(now, organizationTimezone, 30),
      })
      .eq("id", orgA);
  });

  it("defers a push notification past the window instead of sending it", async () => {
    const notificationId = await insertNotification({ channel: "push" });

    await processScheduledNotifications(1000);

    const notification = await fetchNotification(notificationId);
    expect(notification.status).toBe("scheduled");
    expect(new Date(notification.scheduled_for!).getTime()).toBeGreaterThan(Date.now());

    const { data: logs } = await admin
      .from("notification_logs")
      .select("event, detail")
      .eq("notification_id", notificationId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(logs![0]).toMatchObject({ event: "scheduled", detail: "deferred for quiet hours" });
  });

  it("still sends email during the same window", async () => {
    const notificationId = await insertNotification({ channel: "email", title: `Quiet hours email ${RUN}` });

    await processScheduledNotifications(1000);

    const notification = await fetchNotification(notificationId);
    expect(notification.status).toBe("sent");
  });
});
