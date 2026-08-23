"use client";

import { format } from "date-fns";
import { useActionState, useEffect, useState } from "react";

import { DatePicker } from "@/components/form/date-picker";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { getAvailableSlotsAction, rescheduleAppointmentAction } from "@/features/appointments/actions";
import { idleState } from "@/lib/forms";

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return TIME_LABEL_FORMATTER.format(new Date(2000, 0, 1, hours, minutes));
}

/** Picks a new date and time for an existing appointment, keeping doctor/service fixed. */
export function RescheduleForm({
  appointmentId,
  doctorId,
  serviceId,
  visitType,
  currentStartsAt,
  onDone,
}: {
  appointmentId: string;
  doctorId: string;
  serviceId: string;
  visitType: string;
  currentStartsAt: string;
  onDone?: () => void;
}) {
  const [date, setDate] = useState<Date | undefined>(new Date(currentStartsAt));
  const [time, setTime] = useState("");
  const dateValue = date ? format(date, "yyyy-MM-dd") : "";

  type SlotsState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "loaded"; slots: string[] }
    | { status: "empty"; reason: string }
    | { status: "error" };

  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });

  // See the equivalent block in BookingForm: resetting state synchronously
  // when a dependency changes belongs during render, not inside the effect.
  const [lastDateValue, setLastDateValue] = useState(dateValue);

  if (dateValue !== lastDateValue) {
    setLastDateValue(dateValue);
    setTime("");
    setSlotsState(dateValue ? { status: "loading" } : { status: "idle" });
  }

  useEffect(() => {
    if (!dateValue) return;

    let cancelled = false;

    getAvailableSlotsAction({ doctorId, serviceId, visitType, date: dateValue }).then((result) => {
      if (cancelled) return;
      if (result.status === "error") setSlotsState({ status: "error" });
      else if (result.status === "empty") setSlotsState({ status: "empty", reason: result.reason });
      else setSlotsState({ status: "loaded", slots: result.slots });
    });

    return () => {
      cancelled = true;
    };
  }, [doctorId, serviceId, visitType, dateValue]);

  const [state, formAction] = useActionState(rescheduleAppointmentAction, idleState);

  // Closing the dialog on success, without a synchronous setState in an effect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") onDone?.();
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="date" value={dateValue} />
      <input type="hidden" name="time" value={time} />

      <DatePicker label="New date" name="_date" defaultValue={date} onSelect={setDate} fromDate={new Date()} />

      <div className="grid gap-2">
        <p className="text-sm font-medium">New time</p>

        {slotsState.status === "loading" ? <p className="text-muted-foreground text-sm">Checking availability…</p> : null}
        {slotsState.status === "error" ? <p className="text-destructive text-sm">Could not check availability.</p> : null}
        {slotsState.status === "empty" ? (
          <p className="text-muted-foreground text-sm">
            {slotsState.reason === "no_availability"
              ? "This doctor is not scheduled to work then."
              : "Fully booked for that day."}
          </p>
        ) : null}
        {slotsState.status === "loaded" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slotsState.slots.map((slot) => (
              <Button
                key={slot}
                type="button"
                variant={slot === time ? "default" : "outline"}
                size="touch"
                onClick={() => setTime(slot)}
              >
                {timeLabel(slot)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <SubmitButton pendingLabel="Rescheduling…">
        {time ? `Confirm ${timeLabel(time)}` : "Confirm new time"}
      </SubmitButton>
    </form>
  );
}
