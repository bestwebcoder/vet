import { z } from "zod";

import { kilogramsToGrams, WeightFormatError } from "@/lib/units";
import { optionalText, uuidSchema } from "@/lib/validation/common";

/**
 * One schema for a patient, shared by the form and the server action.
 */

export const PET_SEXES = ["male", "female", "unknown"] as const;
export type PetSex = (typeof PET_SEXES)[number];

/** Microchips are 15 digits under ISO 11784; older chips can be shorter. */
const microchipSchema = z
  .string()
  .trim()
  .regex(/^\d{9,15}$/, "A microchip number is 9 to 15 digits")
  .nullish()
  .transform((value) => value ?? null);

/**
 * Weight is typed in kilograms and stored in grams. Conversion is exact and
 * happens here, once, so no screen or action does its own arithmetic.
 */
const weightSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;

    try {
      return kilogramsToGrams(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof WeightFormatError
            ? error.message
            : "Enter a weight in kilograms, for example 12.4",
      });
      return z.NEVER;
    }
  })
  .nullish()
  .transform((value) => value ?? null);

const dateOfBirthSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date")
  .refine(
    (value) => value === "" || value <= new Date().toISOString().slice(0, 10),
    "A date of birth cannot be in the future",
  )
  .transform((value) => (value === "" ? null : value))
  .nullish()
  .transform((value) => value ?? null);

export const petSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the pet's name").max(80, "Name must be 80 characters or fewer"),
    speciesId: uuidSchema,
    breedId: uuidSchema.nullish().transform((value) => value ?? null),
    sex: z.enum(PET_SEXES).default("unknown"),
    // Null means unrecorded, which is different from "not neutered".
    isNeutered: z.boolean().nullish().transform((value) => value ?? null),
    dateOfBirth: dateOfBirthSchema,
    isDateOfBirthEstimated: z.boolean().default(false),
    weightKg: weightSchema,
    colour: optionalText(60, "Colour"),
    microchipNumber: microchipSchema,
    allergies: optionalText(2000, "Allergies"),
    chronicConditions: optionalText(2000, "Chronic conditions"),
    notes: optionalText(2000, "Notes"),
  })
  .refine((values) => !(values.isDateOfBirthEstimated && values.dateOfBirth === null), {
    message: "Give the estimated date of birth, or clear the estimate",
    path: ["dateOfBirth"],
  });

export type PetInput = z.input<typeof petSchema>;
export type PetValues = z.output<typeof petSchema>;

/**
 * Maps validated input onto database columns.
 *
 * weight_recorded_at is set here rather than in a screen: the database
 * requires a weight and its date to travel together, because Phase 5 must know
 * how stale a figure is before multiplying it by a dose.
 */
export function petToRow(values: PetValues, recordedAt: Date = new Date()) {
  return {
    name: values.name,
    species_id: values.speciesId,
    breed_id: values.breedId,
    sex: values.sex,
    is_neutered: values.isNeutered,
    date_of_birth: values.dateOfBirth,
    is_date_of_birth_estimated: values.isDateOfBirthEstimated,
    weight_grams: values.weightKg,
    weight_recorded_at: values.weightKg === null ? null : recordedAt.toISOString(),
    colour: values.colour,
    microchip_number: values.microchipNumber,
    allergies: values.allergies,
    chronic_conditions: values.chronicConditions,
    notes: values.notes,
  };
}
