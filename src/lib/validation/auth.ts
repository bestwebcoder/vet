import { z } from "zod";

/**
 * One schema per concern, used by the form on the client and by the server
 * action on the server. Server-side validation is the one that counts; the
 * client copy exists so the user sees the problem before a round trip.
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

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(120, "Name must be 120 characters or fewer");

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
