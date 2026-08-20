import { z } from "zod";

/**
 * Validation primitives shared by every entity, so a phone number is judged
 * the same way whoever is typing it.
 */

/**
 * Bangladesh mobile numbers: 11 digits beginning 01, optionally with the +880
 * country code. Stored normalised so the same person cannot be entered twice
 * under two spellings of one number.
 */
const BD_MOBILE = /^(?:\+?880|0)1[3-9]\d{8}$/;

export function normalizePhone(input: string): string {
  const digits = input.replace(/[\s()-]/g, "");
  return digits.replace(/^(?:\+?880|0)/, "+880");
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .refine((value) => BD_MOBILE.test(value.replace(/[\s()-]/g, "")), {
    message: "Enter a valid Bangladesh mobile number, for example 01712345678",
  })
  .transform(normalizePhone);

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .pipe(z.email("Enter a valid email address"))
  .transform((value) => value.toLowerCase());

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the full name")
  .max(120, "Name must be 120 characters or fewer");

export const uuidSchema = z.uuid("Select an option from the list");

/** Optional free text, with blank normalised to null for the database. */
export function optionalText(max: number, label = "This") {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}
