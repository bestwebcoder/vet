import { z } from "zod";

import { emailSchema, optionalText, phoneSchema } from "@/lib/validation/common";

/**
 * A practice's branches — the clinics it operates from.
 *
 * The slug is derived from the name rather than typed: it is only used for a
 * stable per-organization key, never shown, so asking an admin to invent one
 * would be asking for something they cannot judge.
 */
export const branchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a branch name")
    .max(120, "Keep the name under 120 characters"),
  email: emailSchema.nullish().transform((value) => value ?? null),
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  address: optionalText(300, "Address"),
  city: optionalText(120, "City"),
});

export type BranchInput = z.input<typeof branchSchema>;
export type BranchValues = z.output<typeof branchSchema>;

/** Lowercase, hyphenated, and unique per practice — matches branches_slug_format. */
export function branchSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // A name of only punctuation would produce an empty slug, which the check
  // constraint rejects; fall back to something valid rather than fail on save.
  return base || `branch-${Date.now().toString(36)}`;
}
