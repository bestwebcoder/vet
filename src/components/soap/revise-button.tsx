"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { reviseSoapAction } from "@/features/soap/actions";
import { idleState } from "@/lib/forms";

export function ReviseSoapButton({ soapRecordId }: { soapRecordId: string }) {
  const [state, formAction] = useActionState(reviseSoapAction, idleState);

  return (
    <form action={formAction} className="grid gap-2">
      <FormAlert state={state} />
      <input type="hidden" name="soapRecordId" value={soapRecordId} />
      <SubmitButton pendingLabel="Starting revision…">Revise this record</SubmitButton>
    </form>
  );
}
