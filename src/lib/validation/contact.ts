import { z } from "zod";

import { emailSchema, fullNameSchema, phoneSchema } from "@/lib/validation/common";

/** The one form a signed-out visitor can submit — kept intentionally small. */
export const contactMessageSchema = z.object({
  name: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  message: z
    .string()
    .trim()
    .min(10, "Say a little more — at least 10 characters.")
    .max(4000, "Keep your message under 4000 characters."),
});

export type ContactMessageInput = z.input<typeof contactMessageSchema>;
export type ContactMessageValues = z.output<typeof contactMessageSchema>;
