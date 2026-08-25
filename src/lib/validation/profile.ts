import { z } from "zod";

import { passwordSchema } from "@/lib/validation/auth";
import { uuidSchema } from "@/lib/validation/common";

/**
 * A person changing their own password, while signed in — distinct from
 * resetPasswordSchema (lib/validation/auth.ts), which is reached only
 * through a one-time recovery link and so has no current password to check.
 * Reuses the same strong-password policy as every other place a full
 * password gets set.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/**
 * An admin setting a password directly for someone they administer — no
 * current password to verify, since it is not the account holder typing it.
 */
export const adminSetPasswordSchema = z
  .object({
    targetUserId: uuidSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AdminSetPasswordInput = z.input<typeof adminSetPasswordSchema>;
