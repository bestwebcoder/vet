"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { updateDoctorPhotoAction } from "@/features/doctors/actions";
import { idleState } from "@/lib/forms";

/** Admin uploads a doctor's photo — shown on this list and the public Doctors page. */
export function DoctorPhotoForm({ doctorId, photoUrl }: { doctorId: string; photoUrl: string | null }) {
  const [state, formAction] = useActionState(updateDoctorPhotoAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-2">
      <FormAlert state={state} />
      <input type="hidden" name="doctorId" value={doctorId} />
      <ImageCropField
        id={`photo-${doctorId}`}
        name="photo"
        label="Photo"
        hint="Crop to a face-centred circle — this is exactly how it appears in the app and on the public Doctors page."
        errors={fieldErrors?.photo}
        aspect={1}
        outputWidth={500}
        outputHeight={500}
        shape="round"
        previewUrl={photoUrl}
      />
      <SubmitButton pendingLabel="Uploading…">Save photo</SubmitButton>
    </form>
  );
}
