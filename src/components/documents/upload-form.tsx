"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Field } from "@/components/form/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDocumentAction } from "@/features/documents/actions";
import { idleState } from "@/lib/forms";

export function DocumentUploadForm({ petId }: { petId: string }) {
  const [state, formAction] = useActionState(uploadDocumentAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // Clear the chosen file after a successful upload, so a second submit
  // cannot silently upload the same file twice. In an effect rather than
  // during render: the form is a DOM node, not something rendering derives.
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4" noValidate>
      <FormAlert state={state} />

      <input type="hidden" name="petId" value={petId} />

      <div className="grid gap-2">
        <Label htmlFor="file">File</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="h-11 py-2.5"
          aria-invalid={Boolean(fieldErrors?.file) || undefined}
        />
        <p className="text-muted-foreground text-sm">JPEG, PNG, WebP or PDF, up to 20 MB.</p>
      </div>

      <Field
        label="Description"
        name="description"
        placeholder="Vaccination card from the previous clinic"
        errors={fieldErrors?.description}
      />

      <SubmitButton pendingLabel="Uploading…">Upload document</SubmitButton>
    </form>
  );
}
