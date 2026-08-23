"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createDiagnosticAction, updateDiagnosticAction } from "@/features/soap/diagnostics-actions";
import type { DiagnosticTest } from "@/features/soap/queries";
import { idleState } from "@/lib/forms";

const STATUS_LABEL: Record<string, string> = {
  ordered: "Ordered",
  in_progress: "In progress",
  completed: "Completed",
};

function UpdateDiagnosticForm({
  test,
  petId,
  appointmentId,
  documents,
}: {
  test: DiagnosticTest;
  petId: string;
  appointmentId: string;
  documents: { id: string; fileName: string }[];
}) {
  const [state, formAction] = useActionState(updateDiagnosticAction, idleState);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <FormAlert state={state} />
      <input type="hidden" name="diagnosticId" value={test.id} />
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="appointmentId" value={appointmentId} />

      <SelectField
        label="Status"
        name="status"
        options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
        defaultValue={test.status}
      />
      <SelectField
        label="Report"
        name="documentId"
        options={[
          { value: "", label: "No report linked yet" },
          ...documents.map((doc) => ({ value: doc.id, label: doc.fileName })),
        ]}
        defaultValue={test.documentId ?? ""}
      />
      <div className="grid gap-2 sm:col-span-3">
        <TextAreaField label="Result notes" name="resultNotes" rows={2} defaultValue={test.resultNotes ?? ""} />
      </div>
      <div className="sm:col-span-3">
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}

function AddDiagnosticForm({ appointmentId, petId }: { appointmentId: string; petId: string }) {
  const [state, formAction] = useActionState(createDiagnosticAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="petId" value={petId} />

      <Field label="Test name" name="testName" placeholder="CBC panel" errors={fieldErrors?.testName} />
      <Field label="Type" name="testType" placeholder="Bloodwork, imaging…" errors={fieldErrors?.testType} />
      <SubmitButton pendingLabel="Adding…">Order test</SubmitButton>
    </form>
  );
}

export function DiagnosticsList({
  appointmentId,
  petId,
  tests,
  documents,
  canEdit,
}: {
  appointmentId: string;
  petId: string;
  tests: DiagnosticTest[];
  documents: { id: string; fileName: string }[];
  canEdit: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Diagnostic tests</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {tests.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tests ordered yet.</p>
        ) : (
          <ul className="grid gap-3">
            {tests.map((test) => (
              <li key={test.id} className="grid gap-2 rounded-lg border p-3">
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 text-left text-sm"
                  onClick={() => setExpandedId((current) => (current === test.id ? null : test.id))}
                  disabled={!canEdit}
                >
                  <span className="grid">
                    <span className="font-medium">{test.testName}</span>
                    {test.testType ? <span className="text-muted-foreground text-xs">{test.testType}</span> : null}
                  </span>
                  <Badge variant={test.status === "completed" ? "default" : "secondary"}>
                    {STATUS_LABEL[test.status] ?? test.status}
                  </Badge>
                </button>

                {canEdit && expandedId === test.id ? (
                  <UpdateDiagnosticForm test={test} petId={petId} appointmentId={appointmentId} documents={documents} />
                ) : null}

                {test.resultNotes && expandedId !== test.id ? (
                  <p className="text-muted-foreground text-sm">{test.resultNotes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? <AddDiagnosticForm appointmentId={appointmentId} petId={petId} /> : null}
      </CardContent>
    </Card>
  );
}
