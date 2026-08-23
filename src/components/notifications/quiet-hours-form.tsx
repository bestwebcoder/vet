"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { updateQuietHoursAction } from "@/features/organizations/actions";
import { idleState } from "@/lib/forms";

/** §9.4's practice-level default — defers sms/whatsapp/push, never email. */
export function QuietHoursForm({
  organizationId,
  quietHoursStart,
  quietHoursEnd,
}: {
  organizationId: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}) {
  const [state, formAction] = useActionState(updateQuietHoursAction, idleState);

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="text-muted-foreground text-sm">
        SMS, WhatsApp and push notifications are held back during this window and sent as soon as it ends. Email is
        never delayed. Leave both blank to disable quiet hours.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Starts"
          name="quietHoursStart"
          type="time"
          defaultValue={quietHoursStart?.slice(0, 5) ?? ""}
          errors={state.status === "error" ? state.fieldErrors?.quietHoursStart : undefined}
        />
        <Field
          label="Ends"
          name="quietHoursEnd"
          type="time"
          defaultValue={quietHoursEnd?.slice(0, 5) ?? ""}
          errors={state.status === "error" ? state.fieldErrors?.quietHoursEnd : undefined}
        />
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
