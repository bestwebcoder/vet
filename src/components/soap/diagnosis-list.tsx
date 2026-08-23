"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDiagnosisAction, removeDiagnosisAction } from "@/features/soap/diagnoses-actions";
import type { Diagnosis } from "@/features/soap/queries";
import { idleState } from "@/lib/forms";

const KIND_LABEL: Record<string, string> = { differential: "Differential", final: "Final" };

function RemoveDiagnosisButton({ diagnosisId, petId, appointmentId }: { diagnosisId: string; petId: string; appointmentId: string }) {
  const [, formAction] = useActionState(removeDiagnosisAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="diagnosisId" value={diagnosisId} />
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Remove diagnosis">
        <Trash2 aria-hidden />
      </Button>
    </form>
  );
}

/** Diagnoses are editable independently of the SOAP note's draft/finalized state. */
export function DiagnosisList({
  appointmentId,
  petId,
  diagnoses,
  canEdit,
}: {
  appointmentId: string;
  petId: string;
  diagnoses: Diagnosis[];
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState(addDiagnosisAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diagnoses</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {diagnoses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No diagnoses recorded yet.</p>
        ) : (
          <ul className="grid gap-2">
            {diagnoses.map((diagnosis) => (
              <li key={diagnosis.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex flex-1 items-start gap-2">
                  <Badge variant="secondary">{KIND_LABEL[diagnosis.kind] ?? diagnosis.kind}</Badge>
                  <span>{diagnosis.description}</span>
                </span>
                {canEdit ? (
                  <RemoveDiagnosisButton diagnosisId={diagnosis.id} petId={petId} appointmentId={appointmentId} />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <form action={formAction} className="grid gap-3 border-t pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <FormAlert state={state} />
            <input type="hidden" name="appointmentId" value={appointmentId} />
            <input type="hidden" name="petId" value={petId} />

            <SelectField
              label="Kind"
              name="kind"
              options={[
                { value: "differential", label: "Differential" },
                { value: "final", label: "Final" },
              ]}
              defaultValue="differential"
            />
            <Field label="Diagnosis" name="description" errors={fieldErrors?.description} />
            <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
