"use client";

import { format } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { DatePicker } from "@/components/form/date-picker";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { TextAreaField } from "@/components/form/textarea-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createAppointmentAction,
  getAvailableSlotsAction,
} from "@/features/appointments/actions";
import { VISIT_TYPE_LABELS, VISIT_TYPES } from "@/lib/validation/appointment";
import { idleState } from "@/lib/forms";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type ServiceOption = Option & { durationMinutes: number };

type BookingFormProps = {
  /** The client's own pets. A single pre-selected patient skips this step entirely. */
  pets: Option[];
  fixedPet?: boolean;
  /** Pre-selects a pet within the "pet" step, e.g. arriving from that pet's own record. */
  defaultPetId?: string;
  /** Pre-fills the visit type and reason steps, e.g. booking a follow-up from a SOAP record. */
  defaultVisitType?: string;
  defaultReason?: string;
  /** When booking a follow-up from a SOAP record, marks it scheduled once this succeeds. */
  sourceSoapRecordId?: string;
  services: ServiceOption[];
  doctors: Option[];
  successHref: string;
};

type Step = "pet" | "service" | "doctor" | "visitType" | "date" | "time" | "reason" | "location";

const STEP_LABELS: Record<Step, string> = {
  pet: "Pet",
  service: "Service",
  doctor: "Doctor",
  visitType: "Visit type",
  date: "Date",
  time: "Time",
  reason: "Reason for visit",
  location: "Location",
};

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function timeLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const reference = new Date(2000, 0, 1, hours, minutes);
  return TIME_LABEL_FORMATTER.format(reference);
}

/**
 * Books a visit in the order the brief specifies: pet, service, doctor,
 * visit type, date, time, reason, location. One `<form>`, following the
 * app's convention of accumulating earlier steps as hidden inputs rather than
 * a multi-page flow — see `PetForm` for the same shape applied to one step.
 */
export function BookingForm({
  pets,
  fixedPet,
  defaultPetId,
  defaultVisitType,
  defaultReason,
  sourceSoapRecordId,
  services,
  doctors,
  successHref,
}: BookingFormProps) {
  const steps: Step[] = fixedPet
    ? ["service", "doctor", "visitType", "date", "time", "reason", "location"]
    : ["pet", "service", "doctor", "visitType", "date", "time", "reason", "location"];

  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];

  const [petId, setPetId] = useState(
    defaultPetId && pets.some((pet) => pet.id === defaultPetId) ? defaultPetId : (pets[0]?.id ?? ""),
  );
  const [serviceId, setServiceId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [visitType, setVisitType] = useState(
    defaultVisitType && VISIT_TYPES.includes(defaultVisitType as (typeof VISIT_TYPES)[number]) ? defaultVisitType : "",
  );
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState("");
  const [reason, setReason] = useState(defaultReason ?? "");
  const [location, setLocation] = useState("");

  const dateValue = date ? format(date, "yyyy-MM-dd") : "";

  type SlotsState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "loaded"; slots: string[] }
    | { status: "empty"; reason: string }
    | { status: "error" };

  const [slotsState, setSlotsState] = useState<SlotsState>({ status: "idle" });

  // A previously chosen time silently stops being valid once any of its
  // inputs change (going back and picking a different doctor, say). Rather
  // than clear it and flip to "loading" from inside the effect below — which
  // would be a synchronous setState during an effect — both happen here,
  // during render, the moment the key these depend on changes.
  const slotsKey = `${doctorId}|${serviceId}|${visitType}|${dateValue}`;
  const [lastSlotsKey, setLastSlotsKey] = useState(slotsKey);

  if (slotsKey !== lastSlotsKey) {
    setLastSlotsKey(slotsKey);
    setTime("");
    setSlotsState(doctorId && serviceId && visitType && dateValue ? { status: "loading" } : { status: "idle" });
  }

  useEffect(() => {
    if (!doctorId || !serviceId || !visitType || !dateValue) return;

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

  const [state, formAction] = useActionState(createAppointmentAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="text-primary size-10" aria-hidden />
          <p className="font-medium">{state.message}</p>
          <Link href={successHref} className="text-sm underline underline-offset-4">
            View appointments
          </Link>
        </CardContent>
      </Card>
    );
  }

  const selectedService = services.find((service) => service.id === serviceId);

  const canAdvance: Record<Step, boolean> = {
    pet: Boolean(petId),
    service: Boolean(serviceId),
    doctor: Boolean(doctorId),
    visitType: Boolean(visitType),
    date: Boolean(dateValue),
    time: Boolean(time),
    reason: true,
    location: true,
  };

  const isLastStep = stepIndex === steps.length - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book an appointment</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-6" noValidate>
          <FormAlert state={state} />

          {fixedPet && pets[0] ? (
            <p className="text-muted-foreground text-sm">
              Booking for <span className="text-foreground font-medium">{pets[0].name}</span>
            </p>
          ) : null}

          <input type="hidden" name="petId" value={petId} />
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="doctorId" value={doctorId} />
          <input type="hidden" name="visitType" value={visitType} />
          <input type="hidden" name="date" value={dateValue} />
          <input type="hidden" name="time" value={time} />
          <input type="hidden" name="reason" value={reason} />
          <input type="hidden" name="location" value={location} />
          {sourceSoapRecordId ? (
            <input type="hidden" name="sourceSoapRecordId" value={sourceSoapRecordId} />
          ) : null}

          <div className="grid gap-2">
            <ol className="flex flex-wrap gap-1.5">
              {steps.map((label, index) => (
                <li
                  key={label}
                  aria-current={index === stepIndex ? "step" : undefined}
                  className={cn(
                    "h-1.5 flex-1 min-w-6 rounded-full",
                    index <= stepIndex ? "bg-primary" : "bg-muted",
                  )}
                />
              ))}
            </ol>
            <p className="text-muted-foreground text-xs">
              Step {stepIndex + 1} of {steps.length} — {STEP_LABELS[step]}
            </p>
          </div>

          {step === "pet" ? (
            <SelectField
              label="Which pet"
              name="_petId"
              options={pets.map((pet) => ({ value: pet.id, label: pet.name }))}
              value={petId}
              onValueChange={setPetId}
              placeholder="Select a pet"
              errors={fieldErrors?.petId}
            />
          ) : null}

          {step === "service" ? (
            <SelectField
              label="Service"
              name="_serviceId"
              options={services.map((service) => ({
                value: service.id,
                label: `${service.name} · ${service.durationMinutes} min`,
              }))}
              value={serviceId}
              onValueChange={setServiceId}
              placeholder="Select a service"
              errors={fieldErrors?.serviceId}
            />
          ) : null}

          {step === "doctor" ? (
            <SelectField
              label="Doctor"
              name="_doctorId"
              options={doctors.map((doctor) => ({ value: doctor.id, label: doctor.name }))}
              value={doctorId}
              onValueChange={setDoctorId}
              placeholder="Select a doctor"
              errors={fieldErrors?.doctorId}
            />
          ) : null}

          {step === "visitType" ? (
            <SelectField
              label="Visit type"
              name="_visitType"
              options={VISIT_TYPES.map((value) => ({ value, label: VISIT_TYPE_LABELS[value] }))}
              value={visitType}
              onValueChange={setVisitType}
              placeholder="Select a visit type"
              errors={fieldErrors?.visitType}
            />
          ) : null}

          {step === "date" ? (
            <DatePicker
              label="Date"
              name="_date"
              defaultValue={date}
              onSelect={setDate}
              fromDate={new Date()}
              errors={fieldErrors?.date}
            />
          ) : null}

          {step === "time" ? (
            <div className="grid gap-3">
              <p className="text-sm font-medium">Time</p>

              {slotsState.status === "loading" ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Checking availability…
                </p>
              ) : null}

              {slotsState.status === "error" ? (
                <p className="text-destructive text-sm">
                  We could not check availability just now. Please try again.
                </p>
              ) : null}

              {slotsState.status === "empty" ? (
                <p className="text-muted-foreground text-sm">
                  {slotsState.reason === "date_in_past"
                    ? "That date has already passed — choose another."
                    : slotsState.reason === "no_availability"
                      ? "This doctor is not scheduled to work then. Try another date or doctor."
                      : "Fully booked for that day. Try another date."}
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

              {fieldErrors?.time ? (
                <p className="text-destructive text-sm" role="alert">
                  {fieldErrors.time.join(" ")}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === "reason" ? (
            <TextAreaField
              label="Reason for visit"
              name="_reason"
              defaultValue={reason}
              onChange={setReason}
              hint="Optional, but it helps the doctor prepare."
              errors={fieldErrors?.reason}
            />
          ) : null}

          {step === "location" ? (
            <TextAreaField
              label="Location"
              name="_location"
              rows={2}
              defaultValue={location}
              onChange={setLocation}
              hint={
                visitType === "home"
                  ? "The address where the visit will take place."
                  : "Optional — leave blank for the usual clinic location."
              }
              errors={fieldErrors?.location}
            />
          ) : null}

          {selectedService && step !== "pet" ? (
            <p className="text-muted-foreground text-xs">{selectedService.durationMinutes} minute visit</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
            >
              <ChevronLeft aria-hidden />
              Back
            </Button>

            {isLastStep ? (
              <Button type="submit" size="touch" disabled={!canAdvance[step]}>
                Confirm booking
              </Button>
            ) : (
              <Button
                type="button"
                size="touch"
                disabled={!canAdvance[step]}
                onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
