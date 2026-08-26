import type { Area } from "react-easy-crop";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A sanity cap on the source file the browser has to decode before
 * cropping — not the upload limit. Whatever the person picks (a 20MP phone
 * photo, a scanned image, anything up to this) gets downsized to the crop
 * field's output size in the browser before it ever reaches the server, so
 * the byte limits each photo feature module enforces are checked against
 * the small cropped output, not the original.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** Type/size check shared by every image-crop entry point (single or batch). */
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG or WebP image.";
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return "That image is too large to open. Choose a file under 25 MB.";
  }

  return null;
}

/**
 * JPEG has no alpha channel — exporting a transparent-background PNG (a
 * logo, say) through it flattens every transparent pixel to an opaque
 * color, which is why that logo comes out with a black background instead
 * of staying transparent. Callers whose source may have real transparency
 * to keep (the logo form) pass "image/png"; everything else keeps the
 * smaller JPEG output, since photo content (doctor/pet/hero photos) has no
 * alpha to lose.
 */
export function cropImageToBlob(
  imageSrc: string,
  area: Area,
  outputWidth: number,
  outputHeight: number,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg",
): Promise<Blob> {
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
          mimeType,
          mimeType === "image/jpeg" ? 0.9 : undefined,
        );
      }),
  );
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load the image")));
    image.src = src;
  });
}
