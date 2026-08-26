"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";

import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteHeroImageAction, updateHeroImageCaptionAction } from "@/features/organizations/actions";
import { MAX_HERO_CAPTION_LENGTH, MAX_HERO_IMAGES } from "@/features/organizations/hero-image-constants";
import type { OrganizationHeroImage } from "@/features/organizations/queries";
import { idleState } from "@/lib/forms";
import { HeroImageMultiUpload } from "@/components/organizations/hero-image-multi-upload";

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="touch" disabled={pending} aria-busy={pending}>
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}

function CaptionSaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function HeroImageCaptionForm({ image }: { image: OrganizationHeroImage }) {
  const [state, formAction] = useActionState(updateHeroImageCaptionAction, idleState);
  const captionError = state.status === "error" ? (state.fieldErrors?.caption?.[0] ?? state.message) : null;
  const inputId = `hero-caption-${image.id}`;

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="heroImageId" value={image.id} />
      <Label htmlFor={inputId} className="sr-only">
        Caption shown over this slide
      </Label>
      <div className="flex gap-1.5">
        <Input
          id={inputId}
          name="caption"
          defaultValue={image.caption ?? ""}
          placeholder="Caption (optional)"
          maxLength={MAX_HERO_CAPTION_LENGTH}
          aria-invalid={Boolean(captionError) || undefined}
        />
        <CaptionSaveButton />
      </div>
      {captionError ? (
        <p className="text-destructive text-xs" role="alert">
          {captionError}
        </p>
      ) : null}
    </form>
  );
}

function HeroImageThumb({ image }: { image: OrganizationHeroImage }) {
  const [state, formAction] = useActionState(deleteHeroImageAction, idleState);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here. */}
        <img src={image.url} alt="" className="aspect-4/3 w-full rounded-lg object-cover" />

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger
            render={
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 size-8"
                aria-label="Remove this hero image"
              />
            }
          >
            <Trash2 className="size-4" aria-hidden />
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove this hero image?</DialogTitle>
              <DialogDescription>It will no longer appear in the front page slideshow.</DialogDescription>
            </DialogHeader>
            <FormAlert state={state} />
            <form action={formAction}>
              <input type="hidden" name="heroImageId" value={image.id} />
              <DialogFooter>
                <Button type="button" variant="outline" size="touch" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <DeleteButton />
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Keyed by caption so a successful save (which revalidates and brings
          a new `image.caption` down from the server) remounts the field with
          the saved value as its defaultValue, instead of Base UI warning
          about an uncontrolled field's initial value changing post-mount. */}
      <HeroImageCaptionForm key={image.caption ?? ""} image={image} />
    </div>
  );
}

/**
 * The front page hero renders as an auto-advancing carousel (HeroCarousel) —
 * this is the ordered gallery of slides behind it. Doctor photos fill in any
 * remaining slots on the front page itself when this gallery is empty, but
 * this is the admin's own set.
 */
export function HeroImageForm({ heroImages }: { heroImages: OrganizationHeroImage[] }) {
  const atLimit = heroImages.length >= MAX_HERO_IMAGES;
  const remainingSlots = MAX_HERO_IMAGES - heroImages.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Front page hero slideshow</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {heroImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {heroImages.map((image) => (
              <HeroImageThumb key={image.id} image={image} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No hero images yet — the front page fills empty slides with doctor photos instead.
          </p>
        )}

        {atLimit ? (
          <p className="text-muted-foreground text-sm">
            You have reached the limit of {MAX_HERO_IMAGES} hero images. Remove one to add another.
          </p>
        ) : (
          <HeroImageMultiUpload remainingSlots={remainingSlots} />
        )}
      </CardContent>
    </Card>
  );
}
