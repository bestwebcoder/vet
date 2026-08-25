"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateLogoImageAction } from "@/features/organizations/actions";
import { idleState } from "@/lib/forms";

/** The practice logo shown in the site header on every public page. Optional — the header falls back to an initials badge with none set. */
export function LogoImageForm({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction] = useActionState(updateLogoImageAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3">
          <FormAlert state={state} />
          <ImageCropField
            id="logoImage"
            name="logoImage"
            label="Logo image"
            hint="Shown in the header of every public page. Crop it to a square frame."
            errors={fieldErrors?.logoImage}
            aspect={1}
            outputWidth={256}
            outputHeight={256}
            previewUrl={logoUrl}
            previewAlt="Current logo"
          />
          <SubmitButton pendingLabel="Uploading…">Save logo</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
