import { z } from "zod";

import { emailSchema, fullNameSchema, normalizePhone, phoneSchema } from "@/lib/validation/common";

// Re-exported so existing imports of these primitives keep working.
export { emailSchema, fullNameSchema, normalizePhone, phoneSchema };

/**
 * One schema per concern, used by the form on the client and by the server
 * action on the server. Server-side validation is the one that counts; the
 * client copy exists so the user sees the problem before a round trip.
 */

/**
 * Mirrors the Supabase auth policy (minimum_password_length = 10,
 * password_requirements = lower_upper_letters_digits). If these drift apart the
 * user sees a server rejection the form said nothing about.
 */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(72, "Password must be 72 characters or fewer")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/\d/, "Password must contain a number");

export const registerSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately not the full password policy: an existing password that
  // predates a policy change must still be able to sign in.
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
