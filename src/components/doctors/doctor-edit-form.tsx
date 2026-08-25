"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { updateDoctorProfileAction } from "@/features/doctors/actions";
import type { DoctorSummary } from "@/features/doctors/queries";
import { idleState } from "@/lib/forms";

export function DoctorEditForm({
  doctor,
  branches,
  onDone,
}: {
  doctor: DoctorSummary;
  branches: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const [state, formAction] = useActionState(updateDoctorProfileAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") onDone?.();
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="doctorId" value={doctor.id} />

      {branches.length > 1 ? (
        <SelectField
          label="Primary branch"
          name="primaryBranchId"
          options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          defaultValue={doctor.primaryBranchId ?? undefined}
          placeholder="No preference"
        />
      ) : null}

      <Field
        label="Registration number"
        name="registrationNumber"
        defaultValue={doctor.registrationNumber ?? ""}
        errors={fieldErrors?.registrationNumber}
      />
      <Field
        label="Specialization"
        name="specialization"
        defaultValue={doctor.specialization ?? ""}
        errors={fieldErrors?.specialization}
      />
      <Field
        label="Qualifications"
        name="qualifications"
        defaultValue={doctor.qualifications ?? ""}
        errors={fieldErrors?.qualifications}
      />
      <TextAreaField label="Bio" name="bio" rows={3} defaultValue={doctor.bio ?? ""} errors={fieldErrors?.bio} />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isAcceptingAppointments"
          defaultChecked={doctor.isAcceptingAppointments}
          className="accent-primary size-4"
        />
        Accepting new appointments
      </label>

      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
