"use client";

import { format } from "date-fns";
import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markContactMessageReadAction } from "@/features/contact/actions";
import type { ContactMessage } from "@/features/contact/queries";
import { idleState } from "@/lib/forms";

function MarkReadButton({ messageId }: { messageId: string }) {
  const [, formAction] = useActionState(markContactMessageReadAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="messageId" value={messageId} />
      <Button type="submit" variant="outline" size="sm">
        Mark as read
      </Button>
    </form>
  );
}

/** DoD-equivalent for the public contact form: a submission is real, not decorative — this is where it lands. */
export function ContactMessagesList({ messages }: { messages: ContactMessage[] }) {
  return (
    <ul className="grid gap-3">
      {messages.map((message) => (
        <li key={message.id} className="grid gap-2 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              {message.name}
              {message.status === "new" ? <Badge>New</Badge> : null}
            </span>
            {message.status === "new" ? <MarkReadButton messageId={message.id} /> : null}
          </div>
          <p className="text-muted-foreground">
            {message.email}
            {message.phone ? ` · ${message.phone}` : ""} · {format(new Date(message.createdAt), "d MMM yyyy, HH:mm")}
          </p>
          <p className="whitespace-pre-wrap">{message.message}</p>
        </li>
      ))}
    </ul>
  );
}
