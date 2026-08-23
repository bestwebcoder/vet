"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { createInvoiceFromAppointmentAction } from "@/features/invoices/actions";
import { idleState } from "@/lib/forms";

export function CreateInvoiceButton({ appointmentId }: { appointmentId: string }) {
  const [state, formAction] = useActionState(createInvoiceFromAppointmentAction, idleState);

  return (
    <form action={formAction} className="grid gap-2">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <SubmitButton pendingLabel="Creating…">Generate invoice</SubmitButton>
    </form>
  );
}
