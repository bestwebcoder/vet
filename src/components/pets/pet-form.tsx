"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { DatePicker } from "@/components/form/date-picker";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ImageCropField } from "@/components/media/image-crop-field";
import { SelectField } from "@/components/form/select-field";
import type { PetDetail } from "@/features/pets/queries";
import { idleState, type FormState } from "@/lib/forms";
import { gramsToKilograms } from "@/lib/units";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };
type BreedOption = Option & { speciesId: string };

type PetFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  species: Option[];
  breeds: BreedOption[];
  pet?: PetDetail;
  /** Set by clinic staff creating a patient for a named owner. */
  clientId?: string;
  /** Owner picker, when the owner is not already decided by the route. */
  ownerSection?: React.ReactNode;
  /**
   * Where this audience reads a patient record, e.g. `/client/pets`. Set on the
   * routes that create one: the form then confirms the save and takes the
   * person to the record it just made, rather than leaving them looking at a
   * form they have already submitted.
   */
  recordHrefBase?: string;
  submitLabel?: string;
};

/** Long enough to read the confirmation, short enough not to feel stuck. */
const REDIRECT_DELAY_MS = 1600;

/**
 * One form for creating and editing a patient, so the two can never disagree
 * about what a patient is.
 */
export function PetForm({
  action,
  species,
  breeds,
  pet,
  clientId,
  ownerSection,
  recordHrefBase,
  submitLabel = "Save pet",
}: PetFormProps) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  const savedId = state.status === "success" ? state.id : undefined;
  const savedMessage = state.status === "success" ? state.message : undefined;
  const savedWarning = state.status === "success" ? state.warning : undefined;
  const recordHref = recordHrefBase && savedId ? `${recordHrefBase}/${savedId}` : undefined;

  // A save that lost the photo waits for a deliberate click: that sentence has
  // to be read before the screen changes under it.
  useEffect(() => {
    if (!recordHref || savedWarning) return;

    router.prefetch(recordHref);
    const timer = setTimeout(() => router.push(recordHref), REDIRECT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [recordHref, savedWarning, router]);

  const [speciesId, setSpeciesId] = useState(pet?.speciesId ?? "");
  const [isEstimated, setIsEstimated] = useState(pet?.isDateOfBirthEstimated ?? false);

  // Breeds are filtered in the browser: there are few enough that a round trip
  // on every species change would be slower and could fail offline.
  const availableBreeds = breeds.filter((breed) => breed.speciesId === speciesId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{pet ? `Edit ${pet.name}` : "Add a pet"}</CardTitle>
        <CardDescription>
          Only a name and species are required. Anything you do not know can be left blank.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="grid gap-5" noValidate>
          {recordHref ? null : <FormAlert state={state} />}

          {pet ? <input type="hidden" name="petId" value={pet.id} /> : null}
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}

          {ownerSection}

          <Field
            label="Name"
            name="name"
            defaultValue={pet?.name}
            required
            errors={fieldErrors?.name}
          />

          <SelectField
            label="Species"
            name="speciesId"
            options={species.map((option) => ({ value: option.id, label: option.name }))}
            value={speciesId}
            onValueChange={setSpeciesId}
            placeholder="Select a species"
            errors={fieldErrors?.speciesId}
          />

          <SelectField
            label="Breed"
            name="breedId"
            options={availableBreeds.map((breed) => ({ value: breed.id, label: breed.name }))}
            defaultValue={pet?.breedId ?? undefined}
            placeholder={speciesId ? "Select a breed" : "Choose a species first"}
            hint="Leave blank if the breed is mixed or unknown."
            disabled={!speciesId}
          />

          <SelectField
            label="Sex"
            name="sex"
            options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "unknown", label: "Not known" },
            ]}
            defaultValue={pet?.sex ?? "unknown"}
          />

          <SelectField
            label="Neutered or spayed"
            name="isNeutered"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
              // Distinct from "no": nobody has been asked.
              { value: "unknown", label: "Not known" },
            ]}
            defaultValue={
              pet === undefined || pet.isNeutered === null ? "unknown" : pet.isNeutered ? "yes" : "no"
            }
          />

          <div className="grid gap-2">
            <DatePicker
              label="Date of birth"
              name="dateOfBirth"
              defaultValue={pet?.dateOfBirth ? new Date(pet.dateOfBirth) : undefined}
              toDate={new Date()}
              hint="Leave blank if it is not known."
              errors={fieldErrors?.dateOfBirth}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isDateOfBirthEstimated"
                defaultChecked={pet?.isDateOfBirthEstimated}
                onChange={(event) => setIsEstimated(event.target.checked)}
                className="accent-primary size-4"
              />
              This date is an estimate
            </label>
            {isEstimated ? (
              <p className="text-muted-foreground text-sm">
                Ages will be shown as approximate, which matters clinically.
              </p>
            ) : null}
          </div>

          <Field
            label="Weight (kg)"
            name="weightKg"
            inputMode="decimal"
            defaultValue={pet?.weightGrams ? gramsToKilograms(pet.weightGrams) : ""}
            hint="For example 12.4"
            errors={fieldErrors?.weightKg}
          />

          <Field
            label="Colour"
            name="colour"
            defaultValue={pet?.colour ?? ""}
            errors={fieldErrors?.colour}
          />

          <Field
            label="Microchip number"
            name="microchipNumber"
            inputMode="numeric"
            defaultValue={pet?.microchipNumber ?? ""}
            hint="9 to 15 digits, if the pet has one."
            errors={fieldErrors?.microchipNumber}
          />

          <TextArea
            label="Allergies"
            name="allergies"
            defaultValue={pet?.allergies ?? ""}
            errors={fieldErrors?.allergies}
          />

          <TextArea
            label="Chronic conditions"
            name="chronicConditions"
            defaultValue={pet?.chronicConditions ?? ""}
            errors={fieldErrors?.chronicConditions}
          />

          <TextArea
            label="Important notes"
            name="notes"
            defaultValue={pet?.notes ?? ""}
            errors={fieldErrors?.notes}
          />

          <ImageCropField
            name="photo"
            label="Photo"
            hint="Crop to the square frame it's shown in across the app."
            errors={fieldErrors?.photo}
            aspect={1}
            outputWidth={500}
            outputHeight={500}
          />

          <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        </form>
      </CardContent>

      {recordHref ? (
        <Dialog
          open
          // Dismissing is a way of saying "yes, take me there" — the record is
          // saved either way, and there is nothing left on the form to return to.
          onOpenChange={() => router.push(recordHref)}
        >
          <DialogContent showCloseButton={false} className="text-center">
            <DialogHeader className="items-center gap-2">
              <CheckCircle2 className="text-primary size-9" aria-hidden />
              <DialogTitle>{savedMessage ?? "Saved."}</DialogTitle>
              <DialogDescription>
                {savedWarning ?? "Taking you to their record…"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" size="touch" className="w-full" onClick={() => router.push(recordHref)}>
                View record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </Card>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  errors,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  errors?: string[];
}) {
  const hasError = Boolean(errors?.length);

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        aria-invalid={hasError || undefined}
        className={cn(
          "border-input bg-background placeholder:text-muted-foreground rounded-lg border px-3 py-2 text-base",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
          "md:text-sm",
          hasError && "border-destructive",
        )}
      />
      {hasError ? (
        <p className="text-destructive text-sm" role="alert">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
