"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateAvatarAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** Self-service account photo — shown in the sidebar and anywhere else this person's name appears. */
export function AvatarUploadCard({ avatarUrl }: { avatarUrl: string | null }) {
  const [state, formAction] = useActionState(updateAvatarAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Photo</CardTitle>
        <CardDescription>Shown next to your name throughout TV Care.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3">
          <FormAlert state={state} />
          <ImageCropField
            id="avatar"
            name="avatar"
            label="Photo"
            errors={fieldErrors?.avatar}
            aspect={1}
            outputWidth={400}
            outputHeight={400}
            shape="round"
            previewUrl={avatarUrl}
          />
          <SubmitButton pendingLabel="Uploading…">Save photo</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
