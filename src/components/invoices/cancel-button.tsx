"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { cancelInvoiceAction } from "@/features/invoices/actions";
import { idleState } from "@/lib/forms";

export function CancelInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(cancelInvoiceAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Cancel invoice
      </Button>
    );
  }

  return (
    <form action={formAction} className="grid gap-3">
      <FormAlert state={state} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field label="Reason for cancelling" name="cancellationReason" errors={fieldErrors?.cancellationReason} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Cancelling…">Confirm cancellation</SubmitButton>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Never mind
        </Button>
      </div>
    </form>
  );
}
