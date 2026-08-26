"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area } from "react-easy-crop";

import { cropImageToBlob, validateImageFile, ACCEPTED_IMAGE_TYPES } from "@/components/media/image-crop-utils";
import { FormAlert } from "@/components/form/form-alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { addHeroImageAction } from "@/features/organizations/actions";
import { idleState, type FormState } from "@/lib/forms";

const HERO_ASPECT = 4 / 3;
const HERO_OUTPUT_WIDTH = 1200;
const HERO_OUTPUT_HEIGHT = 900;

/**
 * Batch version of the single-file ImageCropField, scoped to the hero
 * gallery: picks several files at once, then crops and uploads them one at a
 * time in the same dialog (each still needs its own 4:3 crop, so there's no
 * way to skip the per-image step). Each crop is uploaded immediately via
 * addHeroImageAction — called directly rather than through a <form>, since
 * the batch needs to await one upload before starting the next image's crop.
 */
export function HeroImageMultiUpload({ remainingSlots }: { remainingSlots: number }) {
  const router = useRouter();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const [queue, setQueue] = useState<File[]>([]);
  const [totalInBatch, setTotalInBatch] = useState(0);
  const [addedInBatch, setAddedInBatch] = useState(0);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<FormState>(idleState);

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  function trackObjectUrl(url: string) {
    objectUrlsRef.current.push(url);
    return url;
  }

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function startCrop(file: File) {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setRawImage(trackObjectUrl(URL.createObjectURL(file)));
    setDialogOpen(true);
  }

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;

    const valid: File[] = [];
    const skipped: string[] = [];
    for (const file of picked) {
      const problem = validateImageFile(file);
      if (problem) skipped.push(`${file.name} (${problem})`);
      else valid.push(file);
    }

    const accepted = valid.slice(0, remainingSlots);
    const overCap = valid.slice(remainingSlots);
    for (const file of overCap) {
      skipped.push(`${file.name} (over the ${remainingSlots === 1 ? "1 remaining slot" : `${remainingSlots} remaining slots`})`);
    }

    if (accepted.length === 0) {
      setState({
        status: "error",
        message: skipped.length ? `Nothing to add — skipped ${skipped.join(", ")}.` : "Choose an image to upload.",
      });
      return;
    }

    setState(
      skipped.length
        ? { status: "error", message: `Skipped ${skipped.join(", ")}. Cropping the rest now.` }
        : idleState,
    );
    setQueue(accepted.slice(1));
    setTotalInBatch(accepted.length);
    setAddedInBatch(0);
    startCrop(accepted[0]);
  }

  async function applyCropAndContinue() {
    if (!rawImage || !croppedArea) return;

    setUploading(true);
    try {
      const blob = await cropImageToBlob(rawImage, croppedArea, HERO_OUTPUT_WIDTH, HERO_OUTPUT_HEIGHT);
      const file = new File([blob], "heroImage.jpg", { type: blob.type });
      const formData = new FormData();
      formData.set("heroImage", file);

      const result = await addHeroImageAction(idleState, formData);

      if (result.status === "error") {
        setDialogOpen(false);
        setQueue([]);
        setState(result);
        return;
      }

      setAddedInBatch((count) => count + 1);
      router.refresh();

      const [next, ...rest] = queue;
      if (next) {
        setQueue(rest);
        startCrop(next);
      } else {
        finishBatch(addedInBatch + 1, totalInBatch);
      }
    } catch {
      setDialogOpen(false);
      setQueue([]);
      setState({ status: "error", message: "Could not process that image. Try again." });
    } finally {
      setUploading(false);
    }
  }

  function finishBatch(added: number, total: number) {
    setDialogOpen(false);
    setRawImage(null);
    setState({
      status: "success",
      message: added === total ? `Added ${added} ${added === 1 ? "image" : "images"}.` : `Added ${added} of ${total} images.`,
    });
  }

  function cancelBatch() {
    const added = addedInBatch;
    const total = totalInBatch;
    setDialogOpen(false);
    setQueue([]);
    setRawImage(null);
    setState(
      added > 0
        ? { status: "success", message: `Added ${added} of ${total} images before you stopped.` }
        : idleState,
    );
  }

  const remainingInDialog = queue.length + 1;
  const currentPosition = totalInBatch - queue.length;

  return (
    <div className="grid gap-3">
      <FormAlert state={state} />

      <div className="grid gap-2">
        <Label htmlFor="heroImages">Add slides</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="touch" onClick={openPicker}>
            Choose images
          </Button>
          <input
            ref={fileInputRef}
            id="heroImages"
            type="file"
            multiple
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            onChange={handleFilesChange}
            className="sr-only"
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Select one or several. Shown in rotation on the public Home page — each is cropped to the 4:3 frame the
          page uses. You can add {remainingSlots} more.
        </p>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && cancelBatch()}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{totalInBatch > 1 ? `Crop image ${currentPosition} of ${totalInBatch}` : "Crop image"}</DialogTitle>
          </DialogHeader>

          <div className="bg-foreground/5 relative h-72 w-full overflow-hidden rounded-lg">
            {rawImage ? (
              <Cropper
                image={rawImage}
                crop={crop}
                zoom={zoom}
                aspect={HERO_ASPECT}
                showGrid
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="hero-batch-zoom">Zoom</Label>
            <input
              id="hero-batch-zoom"
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="accent-primary h-11"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="touch" onClick={cancelBatch} disabled={uploading}>
              {remainingInDialog > 1 ? "Stop here" : "Cancel"}
            </Button>
            <Button type="button" size="touch" onClick={applyCropAndContinue} disabled={uploading || !croppedArea}>
              {uploading ? "Uploading…" : remainingInDialog > 1 ? "Add & continue" : "Add image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
