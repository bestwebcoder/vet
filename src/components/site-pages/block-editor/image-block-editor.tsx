"use client";

import { useActionState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { ImageCropField } from "@/components/media/image-crop-field";
import { SubmitButton } from "@/components/form/submit-button";
import { updateImageBlockAction } from "@/features/site-pages/actions";
import type { ImageBlockContent } from "@/features/site-pages/queries";
import { idleState } from "@/lib/forms";

export function ImageBlockEditor({ pageId, blockId, content }: { pageId: string; blockId: string; content: ImageBlockContent }) {
  const [state, formAction] = useActionState(updateImageBlockAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="blockId" value={blockId} />

      <ImageCropField
        id={`image-${blockId}`}
        name="image"
        label="Image"
        hint="Crop it to the 16:9 frame the page uses. Leave unchanged to keep the current image."
        errors={fieldErrors?.image}
        aspect={16 / 9}
        outputWidth={1600}
        outputHeight={900}
        previewUrl={content.url}
        previewAlt=""
      />
      <Field label="Caption (optional)" name="caption" defaultValue={content.caption ?? ""} errors={fieldErrors?.caption} />

      <SubmitButton pendingLabel="Saving…">Save block</SubmitButton>
    </form>
  );
}
