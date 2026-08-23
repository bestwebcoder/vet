"use client";

import { format } from "date-fns";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { retryNotificationAction } from "@/features/notifications/actions";
import type { FailedNotification } from "@/features/notifications/queries";
import { idleState } from "@/lib/forms";
import { NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_TYPE_LABELS } from "@/lib/notifications/catalog";

function RetryButton({ notificationId }: { notificationId: string }) {
  const [, formAction] = useActionState(retryNotificationAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="notificationId" value={notificationId} />
      <Button type="submit" variant="outline" size="sm">
        Retry now
      </Button>
    </form>
  );
}

/** DoD: "Failed sends retry and surface in an admin view." This is that view. */
export function FailedNotificationsList({ notifications }: { notifications: FailedNotification[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Failed notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has failed. Every scheduled send is either delivered or still in progress.</p>
        ) : (
          <ul className="grid gap-2">
            {notifications.map((notification) => (
              <li key={notification.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    {notification.title}
                    <Badge variant="secondary">
                      {NOTIFICATION_CHANNEL_LABELS[notification.channel as keyof typeof NOTIFICATION_CHANNEL_LABELS] ?? notification.channel}
                    </Badge>
                  </span>
                  <RetryButton notificationId={notification.id} />
                </div>
                <p className="text-muted-foreground">
                  {NOTIFICATION_TYPE_LABELS[notification.type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? notification.type}
                  {notification.recipientName ? ` · ${notification.recipientName}` : ""}
                  {" · "}
                  {format(new Date(notification.createdAt), "d MMM yyyy, HH:mm")}
                </p>
                {notification.failureReason ? (
                  <p className="text-destructive">Reason: {notification.failureReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
