"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { revisePrescriptionAction } from "@/features/prescriptions/actions";
import { idleState } from "@/lib/forms";

export function RevisePrescriptionButton({ prescriptionId }: { prescriptionId: string }) {
  const [state, formAction] = useActionState(revisePrescriptionAction, idleState);

  return (
    <form action={formAction} className="grid gap-2">
      <FormAlert state={state} />
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      <SubmitButton pendingLabel="Starting revision…">Revise this prescription</SubmitButton>
    </form>
  );
}
