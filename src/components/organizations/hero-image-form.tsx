"use client";

import { useActionState } from "react";

import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        {heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an arbitrary-dimension public image; no build-time optimization to gain here.
          <img src={heroImageUrl} alt="Current front page hero" className="aspect-4/3 w-full max-w-xs rounded-lg object-cover" />
        ) : (
          <p className="text-muted-foreground text-sm">
            No image set yet — the public front page shows an icon-driven hero instead.
          </p>
        )}

        <form action={formAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <FormAlert state={state} />
          <div className="grid gap-2">
            <Label htmlFor="heroImage">Hero image</Label>
            <Input
              id="heroImage"
              name="heroImage"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="h-11 py-2.5"
              aria-invalid={Boolean(fieldErrors?.heroImage) || undefined}
            />
            <p className="text-muted-foreground text-sm">
              Shown beside the headline on the public Home page. JPEG, PNG or WebP, up to 5&nbsp;MB — a 4:3 photo
              (e.g. 1200×900px) fits the frame best.
            </p>
          </div>
          <SubmitButton pendingLabel="Uploading…">Save image</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
