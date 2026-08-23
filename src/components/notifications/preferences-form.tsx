"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { updatePreferenceAction } from "@/features/notifications/actions";
import type { PreferenceMatrix } from "@/features/notifications/queries";
import { idleState } from "@/lib/forms";
import { NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS } from "@/lib/notifications/catalog";
import type { NotificationChannel } from "@/lib/notifications/types";

function PreferenceToggle({
  userId,
  type,
  channel,
  enabled,
}: {
  userId: string;
  type: string;
  channel: NotificationChannel;
  enabled: boolean;
}) {
  const [, formAction] = useActionState(updatePreferenceAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="currentlyEnabled" value={String(enabled)} />
      <Button
        type="submit"
        variant={enabled ? "secondary" : "outline"}
        size="sm"
        aria-label={`${enabled ? "Disable" : "Enable"} ${NOTIFICATION_CHANNEL_LABELS[channel]} for this notification`}
      >
        {enabled ? "On" : "Off"}
      </Button>
    </form>
  );
}

/** §9.4 — a client opts out per channel and per type; everything starts on. */
export function PreferencesForm({ userId, matrix }: { userId: string; matrix: PreferenceMatrix }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Notification</TableHead>
            {NOTIFICATION_CHANNELS.map((channel) => (
              <TableHead key={channel}>{NOTIFICATION_CHANNEL_LABELS[channel]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.map((row) => (
            <TableRow key={row.type}>
              <TableCell>{row.label}</TableCell>
              {NOTIFICATION_CHANNELS.map((channel) => (
                <TableCell key={channel}>
                  <PreferenceToggle userId={userId} type={row.type} channel={channel} enabled={row.channels[channel]} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
