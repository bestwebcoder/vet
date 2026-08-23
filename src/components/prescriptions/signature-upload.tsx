"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSignatureAction } from "@/features/doctors/actions";
import { idleState } from "@/lib/forms";

/**
 * A doctor's signature image, reused on every prescription after this. Not a
 * hard gate on finalizing — a prescription without one falls back to a typed
 * signature on the PDF — just an easy way to add a real one.
 */
export function SignatureUpload() {
  const [state, formAction] = useActionState(updateSignatureAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="text-base">Add your signature</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormAlert state={state} />
          <div className="grid gap-2">
            <Label htmlFor="signature">Signature image</Label>
            <Input
              id="signature"
              name="signature"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="h-11 py-2.5"
              aria-invalid={Boolean(fieldErrors?.signature) || undefined}
            />
            <p className="text-muted-foreground text-sm">
              Optional — without one, prescriptions show your typed name instead.
            </p>
          </div>
          <SubmitButton pendingLabel="Uploading…">Save signature</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
