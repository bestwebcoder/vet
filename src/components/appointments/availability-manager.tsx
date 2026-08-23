"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createAvailabilityAction,
  deleteAvailabilityAction,
} from "@/features/appointments/availability-actions";
import type { AvailabilityWindow } from "@/features/appointments/queries";
import { idleState } from "@/lib/forms";
import { VISIT_TYPE_LABELS, VISIT_TYPES } from "@/lib/validation/appointment";
import { WEEKDAY_LABELS } from "@/lib/validation/availability";

function DeleteWindowButton({ availabilityId }: { availabilityId: string }) {
  const [state, formAction] = useActionState(deleteAvailabilityAction, idleState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="availabilityId" value={availabilityId} />
      {state.status === "error" ? <span className="text-destructive text-xs">{state.message}</span> : null}
      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Remove window">
        <Trash2 aria-hidden />
      </Button>
    </form>
  );
}

function AddWindowForm({
  doctorId,
  branches,
}: {
  doctorId: string;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(createAvailabilityAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <FormAlert state={state} />
      <input type="hidden" name="doctorId" value={doctorId} />

      <SelectField
        label="Day"
        name="weekday"
        options={WEEKDAY_LABELS.map((label, index) => ({ value: String(index), label }))}
        placeholder="Select a day"
        errors={fieldErrors?.weekday}
      />

      <SelectField
        label="Visit type"
        name="visitType"
        options={[
          { value: "", label: "Any visit type" },
          ...VISIT_TYPES.map((value) => ({ value, label: VISIT_TYPE_LABELS[value] })),
        ]}
        defaultValue=""
        errors={fieldErrors?.visitType}
      />

      <Field label="Starts at" name="startsAt" type="time" required errors={fieldErrors?.startsAt} />
      <Field label="Ends at" name="endsAt" type="time" required errors={fieldErrors?.endsAt} />

      <Field
        label="Slot length (minutes)"
        name="slotMinutes"
        type="number"
        min={5}
        max={240}
        defaultValue={30}
        required
        errors={fieldErrors?.slotMinutes}
      />

      {branches.length > 0 ? (
        <SelectField
          label="Branch"
          name="branchId"
          options={[
            { value: "", label: "Any branch (or home visits)" },
            ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
          ]}
          defaultValue=""
        />
      ) : null}

      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Adding…">Add window</SubmitButton>
      </div>
    </form>
  );
}

export function DoctorAvailabilityCard({
  doctorId,
  doctorName,
  windows,
  branches,
}: {
  doctorId: string;
  doctorName: string;
  windows: AvailabilityWindow[];
  branches: { id: string; name: string }[];
}) {
  const byWeekday = WEEKDAY_LABELS.map((label, index) => ({
    label,
    windows: windows.filter((w) => w.weekday === index),
  })).filter((day) => day.windows.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{doctorName}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        {byWeekday.length === 0 ? (
          <p className="text-muted-foreground text-sm">No availability configured yet.</p>
        ) : (
          <div className="grid gap-3">
            {byWeekday.map((day) => (
              <div key={day.label} className="grid gap-1.5">
                <p className="text-sm font-medium">{day.label}</p>
                {day.windows.map((window) => (
                  <div
                    key={window.id}
                    className="text-muted-foreground flex items-center justify-between gap-3 text-sm"
                  >
                    <span data-numeric>
                      {window.startsAt}–{window.endsAt} · {window.slotMinutes} min slots
                      {window.visitType ? ` · ${VISIT_TYPE_LABELS[window.visitType as keyof typeof VISIT_TYPE_LABELS] ?? window.visitType}` : ""}
                    </span>
                    <DeleteWindowButton availabilityId={window.id} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <AddWindowForm doctorId={doctorId} branches={branches} />
      </CardContent>
    </Card>
  );
}
