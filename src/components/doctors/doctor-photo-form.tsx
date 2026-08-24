"use client";

import { useActionState } from "react";
import { UserRound } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDoctorPhotoAction } from "@/features/doctors/actions";
import { idleState } from "@/lib/forms";

/** Admin uploads a doctor's photo — shown on this list and the public Doctors page. */
export function DoctorPhotoForm({ doctorId, photoUrl }: { doctorId: string; photoUrl: string | null }) {
  const [state, formAction] = useActionState(updateDoctorPhotoAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- an arbitrary-dimension public image; no build-time optimization to gain here.
        <img src={photoUrl} alt="" className="size-16 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="bg-secondary text-secondary-foreground flex size-16 shrink-0 items-center justify-center rounded-full">
          <UserRound className="size-6" aria-hidden />
        </span>
      )}

      <form action={formAction} className="grid flex-1 gap-2">
        <FormAlert state={state} />
        <input type="hidden" name="doctorId" value={doctorId} />
        <Label htmlFor="photo" className="sr-only">
          Photo
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="h-11 flex-1 py-2.5"
            aria-invalid={Boolean(fieldErrors?.photo) || undefined}
          />
          <SubmitButton pendingLabel="Uploading…">Save photo</SubmitButton>
        </div>
        <p className="text-muted-foreground text-sm">
          JPEG, PNG or WebP, up to 5&nbsp;MB — a square, face-centred photo (e.g. 500×500px) crops best in the
          circular frame.
        </p>
      </form>
    </div>
  );
}
