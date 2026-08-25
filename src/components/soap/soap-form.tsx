"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveSoapAction } from "@/features/soap/actions";
import type { SoapRecordDetail } from "@/features/soap/queries";
import { idleState } from "@/lib/forms";
import { gramsToKilograms } from "@/lib/units";
import { EXAM_FIELDS, SYSTEM_REVIEW_FIELDS, type TextFieldName } from "@/components/soap/soap-fields";

/**
 * The SOAP form. One long `<form>`, matching `PetForm`'s shape — this
 * codebase has no accordion/tabs primitive, and a clinical form is read
 * top-to-bottom in practice anyway. "Save draft" and "Finalize" are the same
 * action with a different `intent`, so both submit the one set of values.
 */
export function SoapForm({
  appointmentId,
  petName,
  soapRecord,
}: {
  appointmentId: string;
  petName: string;
  soapRecord?: SoapRecordDetail;
}) {
  const [state, formAction] = useActionState(saveSoapAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const value = (name: TextFieldName) => soapRecord?.[name] ?? "";

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {soapRecord ? <input type="hidden" name="soapRecordId" value={soapRecord.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subjective</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field
            label="Chief complaint"
            name="chiefComplaint"
            defaultValue={soapRecord?.chiefComplaint ?? ""}
            placeholder={`Why ${petName} was brought in today`}
            errors={fieldErrors?.chiefComplaint}
          />
          <TextAreaField
            label="History"
            name="history"
            defaultValue={soapRecord?.history ?? ""}
            errors={fieldErrors?.history}
          />
          <Field
            label="Duration"
            name="duration"
            defaultValue={soapRecord?.duration ?? ""}
            placeholder="For example, 3 days"
            errors={fieldErrors?.duration}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {SYSTEM_REVIEW_FIELDS.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                name={field.name}
                defaultValue={value(field.name)}
                errors={fieldErrors?.[field.name]}
              />
            ))}
          </div>

          <TextAreaField
            label="Other observations"
            name="otherObservations"
            defaultValue={soapRecord?.otherObservations ?? ""}
            errors={fieldErrors?.otherObservations}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objective — Vitals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Temperature (°C)"
              name="temperatureCelsius"
              inputMode="decimal"
              defaultValue={soapRecord?.temperatureCelsius ?? ""}
              hint="For example 38.5"
              errors={fieldErrors?.temperatureCelsius}
            />
            <Field
              label="Pulse (bpm)"
              name="pulseBpm"
              inputMode="numeric"
              defaultValue={soapRecord?.pulseBpm ?? ""}
              errors={fieldErrors?.pulseBpm}
            />
            <Field
              label="Respiratory rate (breaths/min)"
              name="respiratoryRateBpm"
              inputMode="numeric"
              defaultValue={soapRecord?.respiratoryRateBpm ?? ""}
              errors={fieldErrors?.respiratoryRateBpm}
            />
            <Field
              label="Weight (kg)"
              name="weightKg"
              inputMode="decimal"
              defaultValue={soapRecord?.weightGrams ? gramsToKilograms(soapRecord.weightGrams) : ""}
              hint="For example 12.4"
              errors={fieldErrors?.weightKg}
            />
            <Field
              label="Body condition score (1–9)"
              name="bodyConditionScore"
              inputMode="numeric"
              defaultValue={soapRecord?.bodyConditionScore ?? ""}
              errors={fieldErrors?.bodyConditionScore}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Mucous membrane"
              name="mucousMembrane"
              defaultValue={soapRecord?.mucousMembrane ?? ""}
              errors={fieldErrors?.mucousMembrane}
            />
            <Field
              label="Capillary refill time"
              name="capillaryRefillTime"
              defaultValue={soapRecord?.capillaryRefillTime ?? ""}
              errors={fieldErrors?.capillaryRefillTime}
            />
            <Field
              label="Hydration status"
              name="hydrationStatus"
              defaultValue={soapRecord?.hydrationStatus ?? ""}
              errors={fieldErrors?.hydrationStatus}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Objective — Physical Examination</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {EXAM_FIELDS.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                name={field.name}
                defaultValue={value(field.name)}
                errors={fieldErrors?.[field.name]}
              />
            ))}
          </div>
          <TextAreaField
            label="Examination notes"
            name="examNotes"
            defaultValue={soapRecord?.examNotes ?? ""}
            hint="Anything not covered above."
            errors={fieldErrors?.examNotes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <TextAreaField
            label="Clinical assessment"
            name="clinicalAssessment"
            defaultValue={soapRecord?.clinicalAssessment ?? ""}
            errors={fieldErrors?.clinicalAssessment}
          />
          <TextAreaField
            label="Problem list"
            name="problemList"
            defaultValue={soapRecord?.problemList ?? ""}
            errors={fieldErrors?.problemList}
          />
          <p className="text-muted-foreground text-sm">
            Differential and final diagnoses are recorded separately, below, once this record has been saved.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <TextAreaField
            label="Treatment"
            name="treatment"
            defaultValue={soapRecord?.treatment ?? ""}
            errors={fieldErrors?.treatment}
          />
          <TextAreaField
            label="Medication"
            name="medication"
            defaultValue={soapRecord?.medication ?? ""}
            hint="A quick summary — build the actual prescription from this visit's appointment page."
            errors={fieldErrors?.medication}
          />
          <TextAreaField
            label="Diagnostics"
            name="diagnosticsPlan"
            defaultValue={soapRecord?.diagnosticsPlan ?? ""}
            hint="What is being ordered. Add the individual tests below once this record is saved."
            errors={fieldErrors?.diagnosticsPlan}
          />
          <TextAreaField
            label="Diet"
            name="diet"
            defaultValue={soapRecord?.diet ?? ""}
            errors={fieldErrors?.diet}
          />
          <TextAreaField
            label="Hospitalization"
            name="hospitalization"
            defaultValue={soapRecord?.hospitalization ?? ""}
            errors={fieldErrors?.hospitalization}
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="followUpNeeded"
              defaultChecked={soapRecord?.followUpNeeded ?? false}
              className="accent-primary size-4"
            />
            A follow-up visit is needed
          </label>
          <TextAreaField
            label="Follow-up notes"
            name="followUpNotes"
            rows={2}
            defaultValue={soapRecord?.followUpNotes ?? ""}
            errors={fieldErrors?.followUpNotes}
          />

          <TextAreaField
            label="Client instructions"
            name="clientInstructions"
            defaultValue={soapRecord?.clientInstructions ?? ""}
            hint="Shown to the owner alongside this visit once finalized."
            errors={fieldErrors?.clientInstructions}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="submit" name="intent" value="draft" variant="outline" size="touch">
          Save draft
        </Button>
        <Button type="submit" name="intent" value="finalize" size="touch">
          Finalize
        </Button>
      </div>
    </form>
  );
}
