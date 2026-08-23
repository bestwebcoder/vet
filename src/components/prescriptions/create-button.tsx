"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { createPrescriptionAction } from "@/features/prescriptions/actions";
import { idleState } from "@/lib/forms";

export function CreatePrescriptionButton({ appointmentId }: { appointmentId: string }) {
  const [state, formAction] = useActionState(createPrescriptionAction, idleState);

  return (
    <form action={formAction} className="grid gap-2">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <SubmitButton pendingLabel="Starting…">Start prescription</SubmitButton>
    </form>
  );
}
