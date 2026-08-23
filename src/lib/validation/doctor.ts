import { z } from "zod";

import { emailSchema, fullNameSchema, optionalText, phoneSchema, uuidSchema } from "@/lib/validation/common";

/**
 * One schema for inviting a doctor, one for editing their profile
 * afterward — an invite fixes the account identity (email/name/phone),
 * which a profile edit never touches again.
 */

export const inviteDoctorSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  primaryBranchId: uuidSchema.nullish().transform((value) => value ?? null),
  registrationNumber: optionalText(60, "Registration number"),
  specialization: optionalText(120, "Specialization"),
  qualifications: optionalText(300, "Qualifications"),
});

export type InviteDoctorInput = z.input<typeof inviteDoctorSchema>;
export type InviteDoctorValues = z.output<typeof inviteDoctorSchema>;

export const updateDoctorProfileSchema = z.object({
  primaryBranchId: uuidSchema.nullish().transform((value) => value ?? null),
  registrationNumber: optionalText(60, "Registration number"),
  specialization: optionalText(120, "Specialization"),
  qualifications: optionalText(300, "Qualifications"),
  bio: optionalText(1000, "Bio"),
});

export type UpdateDoctorProfileInput = z.input<typeof updateDoctorProfileSchema>;
export type UpdateDoctorProfileValues = z.output<typeof updateDoctorProfileSchema>;
