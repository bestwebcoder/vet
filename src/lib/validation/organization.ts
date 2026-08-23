import { z } from "zod";

import { emailSchema, fullNameSchema, optionalText, phoneSchema } from "@/lib/validation/common";

/**
 * A short, curated list of real IANA zones — not a 400-entry picker, and
 * not multi-organization/branch UI, which CLAUDE.md keeps out of scope for
 * now. Asia/Dhaka is the default and first option; the rest cover the
 * neighbors a second clinic in the region would plausibly need later.
 */
export const TIMEZONE_OPTIONS = [
  { value: "Asia/Dhaka", label: "Dhaka (Bangladesh)" },
  { value: "Asia/Kolkata", label: "Kolkata (India)" },
  { value: "Asia/Kathmandu", label: "Kathmandu (Nepal)" },
  { value: "Asia/Colombo", label: "Colombo (Sri Lanka)" },
  { value: "Asia/Yangon", label: "Yangon (Myanmar)" },
  { value: "Asia/Bangkok", label: "Bangkok (Thailand)" },
] as const;

const timezoneSchema = z.enum(TIMEZONE_OPTIONS.map((option) => option.value) as [string, ...string[]]);

export const organizationSettingsSchema = z.object({
  name: fullNameSchema,
  legalName: optionalText(200, "Legal name"),
  timezone: timezoneSchema,
  email: emailSchema.nullish().transform((value) => value ?? null),
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  whatsappNumber: phoneSchema.nullish().transform((value) => value ?? null),
  address: optionalText(300, "Address"),
  city: optionalText(80, "City"),
  country: fullNameSchema.max(80, "Country must be 80 characters or fewer"),
});

export type OrganizationSettingsInput = z.input<typeof organizationSettingsSchema>;
export type OrganizationSettingsValues = z.output<typeof organizationSettingsSchema>;
