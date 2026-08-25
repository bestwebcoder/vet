"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { updateAvatarAction } from "@/features/profile/actions";
import { idleState } from "@/lib/forms";

/** An admin uploads someone else's account photo — same action as self-service, gated by targetUserId. */
export function AdminAvatarForm({ targetUserId, avatarUrl }: { targetUserId: string; avatarUrl: string | null }) {
  const [state, formAction] = useActionState(updateAvatarAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3">
      <FormAlert state={state} />
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <ImageCropField
        id={`avatar-${targetUserId}`}
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
  );
}
