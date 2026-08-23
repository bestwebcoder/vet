"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { processNotificationsNowAction } from "@/features/notifications/actions";

/**
 * Local/ops convenience — production dispatch comes from an external
 * scheduler hitting POST /api/notifications/process (see that route), not
 * from a person clicking this.
 */
export function ProcessNowButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    const result = await processNotificationsNowAction();
    setMessage(result.status === "success" || result.status === "error" ? (result.message ?? null) : null);
    setPending(false);
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handleClick}>
        {pending ? "Processing…" : "Process due notifications now"}
      </Button>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
    </div>
  );
}
