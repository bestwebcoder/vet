"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { ImageUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A sanity cap on the source file the browser has to decode before
 * cropping — not the upload limit. Whatever the person picks (a 20MP phone
 * photo, a scanned image, anything up to this) gets downsized to
 * outputWidth x outputHeight in the browser before it ever reaches the
 * server, so the byte limits each photo feature module enforces are
 * checked against the small cropped output, not the original.
 */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export type ImageCropFieldProps = {
  id?: string;
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  /** Crop box ratio (width / height) — 1 for a square avatar, 4/3 for the hero image. */
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  shape?: "rect" | "round";
  previewUrl?: string | null;
  previewAlt?: string;
};

/**
 * File picker + in-browser crop dialog, sharing one field name across pet,
 * doctor and hero-image photo forms so all three crop to their display
 * frame instead of relying on CSS object-cover to hide a bad crop.
 *
 * Replaces the native file input's FileList with the cropped output via
 * DataTransfer, so the surrounding <form action={...}> and its Server
 * Action need no changes — formData.get(name) still returns a plain File.
 */
export function ImageCropField({
  id,
  name,
  label,
  hint,
  errors,
  aspect,
  outputWidth,
  outputHeight,
  shape = "rect",
  previewUrl = null,
  previewAlt = "",
}: ImageCropFieldProps) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const hasError = Boolean(errors?.length);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const [rawImage, setRawImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(previewUrl);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function trackObjectUrl(url: string) {
    objectUrlsRef.current.push(url);
    return url;
  }

  // Every crop attempt allocates a source and a preview blob: URL. They're
  // cheap individually, but nothing else revokes them, so release the lot
  // when the field itself goes away (form navigated away from, dialog
  // closed for good) rather than leaking for the life of the tab.
  useEffect(() => {
    // Same array instance for the field's whole lifetime (only ever mutated
    // via push), so capturing it here still sees every URL tracked by the
    // time this cleanup actually runs.
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  function openPicker() {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPickError("Choose a JPEG, PNG or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setPickError("That image is too large to open. Choose a file under 25 MB.");
      event.target.value = "";
      return;
    }

    setPickError(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedArea(null);
    setRawImage(trackObjectUrl(URL.createObjectURL(file)));
    setDialogOpen(true);
  }

  async function applyCrop() {
    if (!rawImage || !croppedArea) return;

    setBusy(true);
    try {
      const blob = await cropImageToBlob(rawImage, croppedArea, outputWidth, outputHeight);
      const file = new File([blob], `${name}.jpg`, { type: blob.type });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (fileInputRef.current) fileInputRef.current.files = dataTransfer.files;

      setPreview(trackObjectUrl(URL.createObjectURL(blob)));
      setDialogOpen(false);
    } catch {
      // Surfaced below the field, not inside the dialog — so close it first,
      // otherwise the message renders behind the still-open crop popup.
      setDialogOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setPickError("Could not process that image. Try a different file.");
    } finally {
      setBusy(false);
    }
  }

  function closeDialog(open: boolean) {
    if (open) return;
    setDialogOpen(false);
    // A cancelled crop must not leave the picked (uncropped) source file
    // sitting in the input. Clearing .value also means picking the exact
    // same file again still fires a change event — browsers skip it
    // otherwise, since the input's value wouldn't have changed.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{label}</Label>

      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: preview of the not-yet-uploaded crop, or the existing photo
          <img
            src={preview}
            alt={previewAlt}
            style={shape === "round" ? undefined : { aspectRatio: aspect }}
            className={cn(
              "bg-muted object-cover",
              shape === "round" ? "size-16 shrink-0 rounded-full" : "w-28 shrink-0 rounded-lg",
            )}
          />
        ) : (
          <span
            style={shape === "round" ? undefined : { aspectRatio: aspect }}
            className={cn(
              "bg-secondary text-secondary-foreground flex shrink-0 items-center justify-center",
              shape === "round" ? "size-16 rounded-full" : "w-28 rounded-lg",
            )}
          >
            <ImageUp className="size-5" aria-hidden />
          </span>
        )}

        <Button type="button" variant="outline" size="touch" onClick={openPicker}>
          {preview ? "Change image" : "Choose image"}
        </Button>

        <input
          ref={fileInputRef}
          id={inputId}
          name={name}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileChange}
          className="sr-only"
          aria-invalid={hasError || Boolean(pickError) || undefined}
          aria-describedby={cn(hasError && errorId, hint && hintId) || undefined}
        />
      </div>

      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {pickError ? (
        <p className="text-destructive text-sm" role="alert">
          {pickError}
        </p>
      ) : hasError ? (
        <p id={errorId} className="text-destructive text-sm" role="alert">
          {errors!.join(" ")}
        </p>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Crop image</DialogTitle>
          </DialogHeader>

          <div className="bg-foreground/5 relative h-72 w-full overflow-hidden rounded-lg">
            {rawImage ? (
              <Cropper
                image={rawImage}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={shape === "round" ? "round" : "rect"}
                showGrid={shape !== "round"}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${inputId}-zoom`}>Zoom</Label>
            <input
              id={`${inputId}-zoom`}
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
            <Button type="button" variant="outline" size="touch" onClick={() => closeDialog(false)}>
              Cancel
            </Button>
            <Button type="button" size="touch" onClick={applyCrop} disabled={busy || !croppedArea}>
              {busy ? "Applying…" : "Apply crop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function cropImageToBlob(imageSrc: string, area: Area, outputWidth: number, outputHeight: number): Promise<Blob> {
  return loadImage(imageSrc).then(
    (image) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvas is not supported"));
          return;
        }

        ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, outputWidth, outputHeight);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Could not export the cropped image"))),
          "image/jpeg",
          0.9,
        );
      }),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load the image")));
    image.src = src;
  });
}
