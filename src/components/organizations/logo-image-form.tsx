"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ImageCropField } from "@/components/media/image-crop-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateFooterShowLogoAction, updateLogoImageAction } from "@/features/organizations/actions";
import { idleState } from "@/lib/forms";

function SaveToggleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/** The practice logo shown in the site header on every public page. Optional — the header falls back to an initials badge with none set. */
export function LogoImageForm({ logoUrl, footerShowLogo }: { logoUrl: string | null; footerShowLogo: boolean }) {
  const [state, formAction] = useActionState(updateLogoImageAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const [footerState, footerFormAction] = useActionState(updateFooterShowLogoAction, idleState);

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
            outputMimeType="image/png"
            previewUrl={logoUrl}
            previewAlt="Current logo"
          />
          <SubmitButton pendingLabel="Uploading…">Save logo</SubmitButton>
        </form>

        {/* Keyed by the current value so a successful save (which brings a
            new `footerShowLogo` prop down from the server) remounts the
            Switch with the saved value as its defaultChecked, instead of
            Base UI warning about an uncontrolled field's initial value
            changing post-mount. */}
        <form key={String(footerShowLogo)} action={footerFormAction} className="grid gap-3 border-t pt-4">
          <FormAlert state={footerState} />
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="footerShowLogo" className="grid gap-0.5">
              <span>Show logo in the footer</span>
              <span className="text-muted-foreground text-sm font-normal">Off shows just the practice name instead.</span>
            </Label>
            <Switch id="footerShowLogo" name="footerShowLogo" defaultChecked={footerShowLogo} />
          </div>
          <SaveToggleButton />
        </form>
      </CardContent>
    </Card>
  );
}
