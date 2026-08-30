import { z } from "zod";

import { CurrencyFormatError, taakaToPaisa } from "@/lib/currency";
import { optionalText } from "@/lib/validation/common";

/** §7.2/§7.3 — an admin-priced, admin-managed service. Prices never hard-coded. */

function optionalId() {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);
}

const priceSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    try {
      return taakaToPaisa(value === "" ? "0" : value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof CurrencyFormatError ? error.message : "Enter an amount in taka, for example 500",
      });
      return z.NEVER;
    }
  });

const taxRateSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? "0" : value))
  .pipe(
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a percentage like 15 or 7.5")
      .transform(Number)
      .refine((value) => value >= 0 && value <= 100, "Enter a percentage between 0 and 100"),
  );

export const serviceSchema = z.object({
  categoryId: optionalId(),
  name: z.string().trim().min(1, "Enter a service name").max(200, "Keep it under 200 characters"),
  description: optionalText(500, "Description"),
  durationMinutes: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number of minutes")
    .transform(Number)
    .refine((value) => value >= 5 && value <= 480, "Duration must be between 5 and 480 minutes"),
  pricePaisa: priceSchema,
  taxRatePercent: taxRateSchema,
  isHomeVisitAvailable: z.boolean(),
  isHomeVisitFee: z.boolean(),
  requiresDoctor: z.boolean(),

  // ── How this service reads on the public page ──────────────────────────
  // All optional: a practice that fills none of it gets the card it had, with
  // the billable price formatted. None of it is read by billing.
  tagline: optionalText(200, "Tagline"),
  inclusionsLabel: optionalText(60, "List heading"),
  inclusions: z.array(z.string().trim().min(1).max(200)).max(12, "Up to 12 points"),
  feeLabel: optionalText(40, "Fee label"),
  feeTiers: z
    .array(
      z.object({
        amount: z.string().trim().min(1, "Enter the fee").max(80, "Keep it under 80 characters"),
        qualifier: optionalText(60, "Applies to"),
      }),
    )
    .max(4, "Up to 4 fee lines"),
  feeNote: optionalText(200, "Fee note"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

/**
 * The half of a service the website editor owns: everything that appears on
 * its block on the public page, and nothing else.
 *
 * Picked from the schema above rather than restated, so the two can never
 * disagree about how long a tagline may be. What it leaves out is the point —
 * price, tax, duration and the booking flags are catalogue decisions, and a
 * form that posts none of them cannot overwrite them by omission.
 */
export const servicePresentationSchema = serviceSchema.pick({
  name: true,
  tagline: true,
  inclusionsLabel: true,
  inclusions: true,
  feeLabel: true,
  feeTiers: true,
  feeNote: true,
});

export type ServicePresentationInput = z.infer<typeof servicePresentationSchema>;

export function servicePresentationToRow(data: ServicePresentationInput) {
  const full = serviceToRow({
    ...data,
    // Placeholders for the columns this row deliberately does not carry; only
    // the presentation keys below are read back out.
    categoryId: null,
    description: null,
    durationMinutes: 0,
    pricePaisa: 0,
    taxRatePercent: 0,
    isHomeVisitAvailable: false,
    isHomeVisitFee: false,
    requiresDoctor: false,
  });

  return {
    name: full.name,
    tagline: full.tagline,
    inclusions_label: full.inclusions_label,
    inclusions: full.inclusions,
    fee_label: full.fee_label,
    fee_tiers: full.fee_tiers,
    fee_note: full.fee_note,
  };
}

export function serviceToRow(data: ServiceInput) {
  return {
    category_id: data.categoryId,
    name: data.name,
    description: data.description,
    duration_minutes: data.durationMinutes,
    price_paisa: data.pricePaisa,
    tax_rate_percent: data.taxRatePercent,
    is_home_visit_available: data.isHomeVisitAvailable,
    is_home_visit_fee: data.isHomeVisitFee,
    requires_doctor: data.requiresDoctor,
    tagline: data.tagline,
    inclusions_label: data.inclusionsLabel,
    inclusions: data.inclusions,
    fee_label: data.feeLabel,
    // Stored with the qualifier omitted rather than null so the column holds
    // the shape the page reads, and nothing else.
    fee_tiers: data.feeTiers.map((tier) =>
      tier.qualifier ? { amount: tier.amount, qualifier: tier.qualifier } : { amount: tier.amount },
    ),
    fee_note: data.feeNote,
  };
}
