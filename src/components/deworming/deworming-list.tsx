"use client";

import { useActionState, useState } from "react";

import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDewormingAction, removeDewormingAction, updateDewormingAction } from "@/features/deworming/actions";
import type { DewormingRecord } from "@/features/deworming/queries";
import { DEWORMING_INTERVAL_LABELS, DEWORMING_INTERVALS, computeNextDewormingDueDate, MissingCustomIntervalError } from "@/lib/deworming-interval";
import { idleState } from "@/lib/forms";
import { gramsToKilograms } from "@/lib/units";

type Props = {
  appointmentId: string;
  petId: string;
  doctorId: string;
  records: DewormingRecord[];
  canEdit: boolean;
};

function toDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

/** Every field a deworming entry needs, shared by the add form and each row's edit form. */
function DewormingFields({
  defaults,
  errors,
}: {
  defaults?: Partial<DewormingRecord>;
  errors?: Record<string, string[] | undefined>;
}) {
  const [dateAdministered, setDateAdministered] = useState<Date | undefined>(toDate(defaults?.dateAdministered));
  const [interval, setInterval] = useState(defaults?.interval ?? "monthly");
  const [customIntervalDays, setCustomIntervalDays] = useState(defaults?.customIntervalDays?.toString() ?? "");
  const [nextDueDate, setNextDueDate] = useState<Date | undefined>(toDate(defaults?.nextDueDate));

  function suggest(date: Date | undefined, nextInterval: typeof interval, days: string) {
    if (!date) return;
    try {
      const suggested = computeNextDewormingDueDate(
        date.toISOString().slice(0, 10),
        nextInterval,
        days ? Number(days) : null,
      );
      setNextDueDate(new Date(`${suggested}T00:00:00`));
    } catch (error) {
      if (!(error instanceof MissingCustomIntervalError)) throw error;
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Product" name="product" defaultValue={defaults?.product ?? ""} errors={errors?.product} />
        <Field
          label="Active ingredient"
          name="activeIngredient"
          defaultValue={defaults?.activeIngredient ?? ""}
          errors={errors?.activeIngredient}
        />
        <Field label="Dose" name="dose" defaultValue={defaults?.dose ?? ""} errors={errors?.dose} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Route" name="route" defaultValue={defaults?.route ?? ""} placeholder="Oral, topical…" errors={errors?.route} />
        <Field
          label="Weight (kg)"
          name="weightGrams"
          inputMode="decimal"
          defaultValue={defaults?.weightGrams ? gramsToKilograms(defaults.weightGrams) : ""}
          errors={errors?.weightGrams}
        />
        <DatePicker
          label="Date administered"
          name="dateAdministered"
          defaultValue={dateAdministered}
          toDate={new Date()}
          onSelect={(date) => {
            setDateAdministered(date);
            suggest(date, interval, customIntervalDays);
          }}
          errors={errors?.dateAdministered}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Interval"
          name="interval"
          options={DEWORMING_INTERVALS.map((value) => ({ value, label: DEWORMING_INTERVAL_LABELS[value] }))}
          value={interval}
          onValueChange={(value) => {
            const next = value as typeof interval;
            setInterval(next);
            suggest(dateAdministered, next, customIntervalDays);
          }}
        />
        {interval === "custom" ? (
          <Field
            label="Custom interval (days)"
            name="customIntervalDays"
            inputMode="numeric"
            value={customIntervalDays}
            onChange={(event) => {
              setCustomIntervalDays(event.target.value);
              suggest(dateAdministered, interval, event.target.value);
            }}
            errors={errors?.customIntervalDays}
          />
        ) : null}
        <DatePicker
          key={nextDueDate ? nextDueDate.toISOString() : "empty"}
          label="Next due date"
          name="nextDueDate"
          defaultValue={nextDueDate}
          hint="Auto-calculated, always editable"
          errors={errors?.nextDueDate}
        />
      </div>

      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} errors={errors?.notes} />
    </div>
  );
}

function AddDewormingForm({ appointmentId, petId, doctorId }: Omit<Props, "records" | "canEdit">) {
  const [state, formAction] = useActionState(addDewormingAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="doctorId" value={doctorId} />
      <DewormingFields errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Recording…">Record deworming</SubmitButton>
      </div>
    </form>
  );
}

function RecordRow({
  record,
  appointmentId,
  petId,
  canEdit,
}: {
  record: DewormingRecord;
  appointmentId: string;
  petId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateDewormingAction, idleState);
  const [, removeAction] = useActionState(removeDewormingAction, idleState);
  const fieldErrors = updateState.status === "error" ? updateState.fieldErrors : undefined;

  if (!editing) {
    return (
      <li className="grid gap-1 rounded-lg border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="font-medium">{record.product}</span>
            <span className="text-muted-foreground text-xs" data-numeric>
              Given {record.dateAdministered} · {DEWORMING_INTERVAL_LABELS[record.interval]} · Next due {record.nextDueDate}
            </span>
            {record.weight ? (
              <span className="text-muted-foreground text-xs" data-numeric>
                {record.weight}
              </span>
            ) : null}
            {record.notes ? <span className="text-muted-foreground text-xs">{record.notes}</span> : null}
          </div>
          {canEdit ? (
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <form action={removeAction}>
                <input type="hidden" name="dewormingId" value={record.id} />
                <input type="hidden" name="appointmentId" value={appointmentId} />
                <input type="hidden" name="petId" value={petId} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <form action={updateAction} className="grid gap-4">
        <FormAlert state={updateState} />
        <input type="hidden" name="dewormingId" value={record.id} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="petId" value={petId} />
        <DewormingFields defaults={record} errors={fieldErrors} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          <Button type="button" variant="outline" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
      </form>
    </li>
  );
}

export function DewormingList({ appointmentId, petId, doctorId, records, canEdit }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deworming</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {records.length === 0 ? (
          <p className="text-muted-foreground text-sm">No deworming recorded for this visit yet.</p>
        ) : (
          <ul className="grid gap-2">
            {records.map((record) => (
              <RecordRow key={record.id} record={record} appointmentId={appointmentId} petId={petId} canEdit={canEdit} />
            ))}
          </ul>
        )}

        {canEdit ? <AddDewormingForm appointmentId={appointmentId} petId={petId} doctorId={doctorId} /> : null}
      </CardContent>
    </Card>
  );
}
