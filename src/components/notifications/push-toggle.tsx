"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { subscribeToPushAction, unsubscribeFromPushAction } from "@/features/notifications/actions";
import { getExistingSubscription, pushSupported, subscribeToPush, subscriptionPayload } from "@/lib/push-client";

type Status = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "working";

/** §9.1's push channel, made real: this is the browser side of the subscribe flow. */
export function PushToggle({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function checkSupport() {
      if (!pushSupported()) {
        setStatus("unsupported");
        return;
      }
      try {
        const subscription = await getExistingSubscription();
        setStatus(subscription ? "subscribed" : "unsubscribed");
      } catch {
        setStatus("unsubscribed");
      }
    }
    void checkSupport();
  }, []);

  async function handleSubscribe() {
    setStatus("working");
    setMessage(null);
    try {
      const subscription = await subscribeToPush();
      const result = await subscribeToPushAction(userId, subscriptionPayload(subscription));
      setMessage(result.status === "success" ? (result.message ?? null) : (result.status === "error" ? result.message : null));
      setStatus("subscribed");
    } catch (error) {
      console.error("[notifications] push subscribe failed", error);
      setMessage("We could not enable push notifications on this device. Check your browser's notification permission.");
      setStatus("unsubscribed");
    }
  }

  async function handleUnsubscribe() {
    setStatus("working");
    setMessage(null);
    try {
      const existing = await getExistingSubscription();
      if (existing) {
        await existing.unsubscribe();
        await unsubscribeFromPushAction(existing.endpoint);
      }
      setStatus("unsubscribed");
    } catch (error) {
      console.error("[notifications] push unsubscribe failed", error);
      setStatus("subscribed");
    }
  }

  if (status === "unsupported") {
    return <p className="text-muted-foreground text-sm">Push notifications are not supported in this browser.</p>;
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status === "checking" || status === "working"}
        onClick={status === "subscribed" ? handleUnsubscribe : handleSubscribe}
      >
        {status === "subscribed" ? "Disable push on this device" : "Enable push on this device"}
      </Button>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}
