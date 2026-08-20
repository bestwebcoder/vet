import { z } from "zod";

import {
  emailSchema,
  fullNameSchema,
  optionalText,
  phoneSchema,
  uuidSchema,
} from "@/lib/validation/common";

/**
 * One schema for a client record, shared by the form and the server action.
 *
 * Email is optional here but required at registration: reception routinely
 * creates a record for a walk-in who has given a phone number and nothing else.
 */
export const clientSchema = z.object({
  fullName: fullNameSchema,
  phone: phoneSchema,
  alternatePhone: phoneSchema.nullish().transform((value) => value ?? null),
  email: emailSchema.nullish().transform((value) => value ?? null),
  preferredBranchId: uuidSchema.nullish().transform((value) => value ?? null),
  address: optionalText(300, "Address"),
  city: optionalText(80, "City"),
  notes: optionalText(2000, "Notes"),
});

export type ClientInput = z.input<typeof clientSchema>;
export type ClientValues = z.output<typeof clientSchema>;

export function clientToRow(values: ClientValues) {
  return {
    full_name: values.fullName,
    phone: values.phone,
    alternate_phone: values.alternatePhone,
    email: values.email,
    preferred_branch_id: values.preferredBranchId,
    address: values.address,
    city: values.city,
    notes: values.notes,
  };
}
