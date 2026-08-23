"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { savePrescriptionAction } from "@/features/prescriptions/actions";
import type { PrescriptionDetail } from "@/features/prescriptions/queries";
import { idleState } from "@/lib/forms";

export function PrescriptionForm({
  prescription,
  appointmentId,
  hasItems,
}: {
  prescription: PrescriptionDetail;
  appointmentId: string;
  hasItems: boolean;
}) {
  const [state, formAction] = useActionState(savePrescriptionAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Prescription details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="prescriptionId" value={prescription.id} />
          <input type="hidden" name="appointmentId" value={appointmentId} />

          <Field
            label="Follow-up date"
            name="followUpDate"
            type="date"
            defaultValue={prescription.followUpDate ?? ""}
            errors={fieldErrors?.followUpDate}
          />
          <TextAreaField
            label="Instructions"
            name="instructions"
            defaultValue={prescription.instructions ?? ""}
            hint="Shown to the owner on the prescription."
            errors={fieldErrors?.instructions}
          />

          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
            Clinical dosing must be reviewed and approved by the attending veterinarian.
          </p>

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="submit" name="intent" value="draft" variant="outline" size="touch">
              Save draft
            </Button>
            <Button type="submit" name="intent" value="finalize" size="touch" disabled={!hasItems}>
              Finalize &amp; sign
            </Button>
          </div>
          {!hasItems ? (
            <p className="text-muted-foreground text-right text-xs">Add at least one medication to finalize.</p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
