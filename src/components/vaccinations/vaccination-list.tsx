"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { DatePicker } from "@/components/form/date-picker";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addVaccinationAction, removeVaccinationAction, updateVaccinationAction } from "@/features/vaccinations/actions";
import type { VaccinationRecord } from "@/features/vaccinations/queries";
import type { VaccinationSchedule } from "@/features/vaccination-schedules/queries";
import { idleState } from "@/lib/forms";
import { computeNextVaccinationDueDate } from "@/lib/vaccination-schedule";

type Props = {
  appointmentId: string;
  petId: string;
  doctorId: string;
  records: VaccinationRecord[];
  schedules: VaccinationSchedule[];
  canEdit: boolean;
};

function toDate(value: string | null): Date | undefined {
  return value ? new Date(`${value}T00:00:00`) : undefined;
}

/**
 * Every field a vaccination entry needs, shared by the add form and each
 * row's edit form. A schedule pick autofills the name and suggests a due
 * date; both stay plain, doctor-editable inputs afterward — the suggestion
 * is never enforced.
 */
function VaccinationFields({
  schedules,
  defaults,
  errors,
}: {
  schedules: VaccinationSchedule[];
  defaults?: Partial<VaccinationRecord>;
  errors?: Record<string, string[] | undefined>;
}) {
  const [scheduleId, setScheduleId] = useState(defaults?.vaccinationScheduleId ?? "");
  const [vaccineName, setVaccineName] = useState(defaults?.vaccineName ?? "");
  const [dateAdministered, setDateAdministered] = useState<Date | undefined>(toDate(defaults?.dateAdministered ?? null));
  const [nextDueDate, setNextDueDate] = useState<Date | undefined>(toDate(defaults?.nextDueDate ?? null));

  function pickSchedule(id: string) {
    setScheduleId(id);
    const schedule = schedules.find((candidate) => candidate.id === id);
    if (!schedule) return;

    setVaccineName(schedule.vaccineName);
    if (dateAdministered) {
      const suggested = computeNextVaccinationDueDate(
        dateAdministered.toISOString().slice(0, 10),
        schedule.intervalValue,
        schedule.intervalUnit,
      );
      setNextDueDate(new Date(`${suggested}T00:00:00`));
    }
  }

  function pickDateAdministered(date: Date | undefined) {
    setDateAdministered(date);
    const schedule = schedules.find((candidate) => candidate.id === scheduleId);
    if (date && schedule) {
      const suggested = computeNextVaccinationDueDate(date.toISOString().slice(0, 10), schedule.intervalValue, schedule.intervalUnit);
      setNextDueDate(new Date(`${suggested}T00:00:00`));
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="From schedule (optional)"
          name="vaccinationScheduleId"
          options={[{ value: "", label: "Type a vaccine name instead" }, ...schedules.map((s) => ({ value: s.id, label: s.vaccineName }))]}
          value={scheduleId}
          onValueChange={pickSchedule}
        />
        <Field
          label="Vaccine name"
          name="vaccineName"
          value={vaccineName}
          onChange={(event) => setVaccineName(event.target.value)}
          errors={errors?.vaccineName}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Manufacturer" name="manufacturer" defaultValue={defaults?.manufacturer ?? ""} errors={errors?.manufacturer} />
        <Field label="Batch number" name="batchNumber" defaultValue={defaults?.batchNumber ?? ""} errors={errors?.batchNumber} />
        <Field label="Lot number" name="lotNumber" defaultValue={defaults?.lotNumber ?? ""} errors={errors?.lotNumber} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <DatePicker
          label="Date administered"
          name="dateAdministered"
          defaultValue={dateAdministered}
          toDate={new Date()}
          onSelect={pickDateAdministered}
          errors={errors?.dateAdministered}
        />
        <DatePicker label="Expiry date" name="expiryDate" defaultValue={toDate(defaults?.expiryDate ?? null)} errors={errors?.expiryDate} />
        <DatePicker
          key={nextDueDate ? nextDueDate.toISOString() : "empty"}
          label="Next due date"
          name="nextDueDate"
          defaultValue={nextDueDate}
          hint="Suggested from the schedule, always editable"
          errors={errors?.nextDueDate}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Dose" name="dose" defaultValue={defaults?.dose ?? ""} errors={errors?.dose} />
        <Field label="Route" name="route" defaultValue={defaults?.route ?? ""} placeholder="SC, IM…" errors={errors?.route} />
        <Field label="Site" name="site" defaultValue={defaults?.site ?? ""} placeholder="Left hind limb…" errors={errors?.site} />
      </div>

      <TextAreaField label="Notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} errors={errors?.notes} />
    </div>
  );
}

function AddVaccinationForm({ appointmentId, petId, doctorId, schedules }: Omit<Props, "records" | "canEdit">) {
  const [state, formAction] = useActionState(addVaccinationAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="petId" value={petId} />
      <input type="hidden" name="doctorId" value={doctorId} />
      <VaccinationFields schedules={schedules} errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Recording…">Record vaccination</SubmitButton>
      </div>
    </form>
  );
}

function RecordRow({
  record,
  appointmentId,
  petId,
  schedules,
  canEdit,
}: {
  record: VaccinationRecord;
  appointmentId: string;
  petId: string;
  schedules: VaccinationSchedule[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateVaccinationAction, idleState);
  const [, removeAction] = useActionState(removeVaccinationAction, idleState);
  const fieldErrors = updateState.status === "error" ? updateState.fieldErrors : undefined;

  if (!editing) {
    return (
      <li className="grid gap-1 rounded-lg border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="font-medium">{record.vaccineName}</span>
            <span className="text-muted-foreground text-xs" data-numeric>
              Given {record.dateAdministered}
              {record.nextDueDate ? ` · Next due ${record.nextDueDate}` : ""}
            </span>
            {record.manufacturer || record.batchNumber ? (
              <span className="text-muted-foreground text-xs">
                {[record.manufacturer, record.batchNumber].filter(Boolean).join(" · ")}
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
                <input type="hidden" name="vaccinationId" value={record.id} />
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
        <input type="hidden" name="vaccinationId" value={record.id} />
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="petId" value={petId} />
        <VaccinationFields schedules={schedules} defaults={record} errors={fieldErrors} />
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

export function VaccinationList({ appointmentId, petId, doctorId, records, schedules, canEdit }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Vaccinations</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {records.length === 0 ? (
          <p className="text-muted-foreground text-sm">No vaccinations recorded for this visit yet.</p>
        ) : (
          <ul className="grid gap-2">
            {records.map((record) => (
              <RecordRow key={record.id} record={record} appointmentId={appointmentId} petId={petId} schedules={schedules} canEdit={canEdit} />
            ))}
          </ul>
        )}

        {canEdit ? (
          <AddVaccinationForm appointmentId={appointmentId} petId={petId} doctorId={doctorId} schedules={schedules} />
        ) : null}
      </CardContent>
    </Card>
  );
}
