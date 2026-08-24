"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageCropField } from "@/components/media/image-crop-field";
import { updateHeroImageAction } from "@/features/organizations/actions";
import { idleState } from "@/lib/forms";

/** The one image an admin controls: the public front page's hero. Optional — the page has an icon-driven fallback with none set. */
export function HeroImageForm({ heroImageUrl }: { heroImageUrl: string | null }) {
  const [state, formAction] = useActionState(updateHeroImageAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Front page image</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3">
          <FormAlert state={state} />
          <ImageCropField
            id="heroImage"
            name="heroImage"
            label="Hero image"
            hint="Shown beside the headline on the public Home page. Crop it to the 4:3 frame the page uses."
            errors={fieldErrors?.heroImage}
            aspect={4 / 3}
            outputWidth={1200}
            outputHeight={900}
            previewUrl={heroImageUrl}
            previewAlt="Current front page hero"
          />
          <SubmitButton pendingLabel="Uploading…">Save image</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
