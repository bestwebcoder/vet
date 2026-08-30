"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createScheduleAction,
  deleteScheduleAction,
  toggleScheduleActiveAction,
  updateScheduleAction,
} from "@/features/vaccination-schedules/actions";
import type { VaccinationSchedule } from "@/features/vaccination-schedules/queries";
import { idleState } from "@/lib/forms";
import { VACCINATION_INTERVAL_UNITS, VACCINATION_INTERVAL_UNIT_LABELS } from "@/lib/validation/vaccination-schedule";

type Species = { id: string; name: string };

function ScheduleFields({
  species,
  defaults,
  errors,
}: {
  species: Species[];
  defaults?: Partial<VaccinationSchedule>;
  errors?: Record<string, string[] | undefined>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Vaccine name" name="vaccineName" defaultValue={defaults?.vaccineName ?? ""} errors={errors?.vaccineName} />
      <SelectField
        label="Species"
        name="speciesId"
        options={[{ value: "", label: "Any species" }, ...species.map((s) => ({ value: s.id, label: s.name }))]}
        defaultValue={defaults?.speciesId ?? ""}
      />
      <Field
        label="Interval"
        name="intervalValue"
        inputMode="numeric"
        defaultValue={defaults?.intervalValue?.toString() ?? "12"}
        errors={errors?.intervalValue}
      />
      <SelectField
        label="Unit"
        name="intervalUnit"
        options={VACCINATION_INTERVAL_UNITS.map((value) => ({ value, label: VACCINATION_INTERVAL_UNIT_LABELS[value] }))}
        defaultValue={defaults?.intervalUnit ?? "months"}
      />
      <div className="sm:col-span-2">
        <TextAreaField label="Description" name="description" rows={2} defaultValue={defaults?.description ?? ""} errors={errors?.description} />
      </div>
    </div>
  );
}

function AddScheduleForm({ species }: { species: Species[] }) {
  const [state, formAction] = useActionState(createScheduleAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <FormAlert state={state} />
      <ScheduleFields species={species} errors={fieldErrors} />
      <div>
        <SubmitButton pendingLabel="Adding…">Add schedule</SubmitButton>
      </div>
    </form>
  );
}

function ToggleActiveButton({ schedule }: { schedule: VaccinationSchedule }) {
  const [, formAction] = useActionState(toggleScheduleActiveAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="scheduleId" value={schedule.id} />
      <input type="hidden" name="isActive" value={String(schedule.isActive)} />
      <Button type="submit" variant="ghost" size="sm">
        {schedule.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

/**
 * Removes a schedule from the list.
 *
 * Worth a confirmation rather than a click, and worth saying what it does not
 * touch: an administrator reaching for this is usually looking at Deactivate,
 * which is the reversible one and keeps the schedule on the screen.
 */
function DeleteScheduleDialog({ schedule }: { schedule: VaccinationSchedule }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteScheduleAction, idleState);

  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>Delete</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {schedule.vaccineName}?</DialogTitle>
          <DialogDescription>
            Vaccinations already recorded against it keep their own vaccine name and dates, so no patient&rsquo;s
            history changes — nothing new is scheduled from it. It waits in Data → Archive, where it can be put back.
          </DialogDescription>
        </DialogHeader>
        <FormAlert state={state} />
        <form action={formAction}>
          <input type="hidden" name="scheduleId" value={schedule.id} />
          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deleting…" className="sm:w-auto">
              Delete schedule
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleRow({ schedule, species }: { schedule: VaccinationSchedule; species: Species[] }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateScheduleAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (!editing) {
    return (
      <li className="grid gap-1 rounded-lg border p-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="flex items-center gap-2 font-medium">
              {schedule.vaccineName}
              {!schedule.isActive ? <Badge variant="outline">Inactive</Badge> : null}
            </span>
            <span className="text-muted-foreground text-xs">
              {schedule.speciesName ?? "Any species"} · Every {schedule.intervalValue} {VACCINATION_INTERVAL_UNIT_LABELS[schedule.intervalUnit].toLowerCase()}
            </span>
            {schedule.description ? <span className="text-muted-foreground text-xs">{schedule.description}</span> : null}
          </div>
          {/* Wraps rather than squeezing: three controls plus a vaccine name
              do not fit one phone-width line. */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <ToggleActiveButton schedule={schedule} />
            <DeleteScheduleDialog schedule={schedule} />
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border p-3">
      <form action={formAction} className="grid gap-4">
        <FormAlert state={state} />
        <input type="hidden" name="scheduleId" value={schedule.id} />
        <ScheduleFields species={species} defaults={schedule} errors={fieldErrors} />
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

export function VaccinationScheduleManager({ schedules, species }: { schedules: VaccinationSchedule[]; species: Species[] }) {
  return (
    <div className="grid gap-4">
      {schedules.length === 0 ? (
        <p className="text-muted-foreground text-sm">No vaccination schedules configured yet.</p>
      ) : (
        <ul className="grid gap-2">
          {schedules.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} species={species} />
          ))}
        </ul>
      )}

      <AddScheduleForm species={species} />
    </div>
  );
}
