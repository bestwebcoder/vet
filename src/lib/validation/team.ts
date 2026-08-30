import { z } from "zod";

import { emailSchema, fullNameSchema, optionalText, phoneSchema, uuidSchema } from "@/lib/validation/common";
import { passwordSchema } from "@/lib/validation/auth";

/**
 * A role grant is identified by id, not by slug.
 *
 * Slugs worked while the seven built-ins were the only roles that could exist.
 * A practice can now define its own, whose slug it chose itself, so the id is
 * the only stable handle — and it is the handle the database checks: the
 * action resolves it against the roles this practice may actually assign, so
 * an id from anywhere else resolves to nothing.
 *
 * "none" removes every active grant in the practice without adding one — the
 * same soft-revoke deactivateDoctorAction and deactivateClientAction use.
 */
export const NO_ROLE = "none";

export const roleGrantSchema = z.union([z.literal(NO_ROLE), uuidSchema], "Choose a role");

export const setTeamRoleSchema = z.object({
  userId: uuidSchema,
  role: roleGrantSchema,
});

export type SetTeamRoleInput = z.input<typeof setTeamRoleSchema>;
export type SetTeamRoleValues = z.output<typeof setTeamRoleSchema>;

/**
 * An administrator adding somebody to the practice.
 *
 * The account is created and usable straight away, with a password the admin
 * sets and passes on however they normally would. There is no invitation
 * email: a practice adding a receptionist is usually standing next to them,
 * and an email they have to find and act on before they can be given a role is
 * a step that fails quietly — the account sits half-made until they get round
 * to it.
 */
export const addTeamMemberSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema.nullish().transform((value) => value ?? null),
    jobTitle: optionalText(120, "Job title"),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: roleGrantSchema,
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AddTeamMemberInput = z.input<typeof addTeamMemberSchema>;
export type AddTeamMemberValues = z.output<typeof addTeamMemberSchema>;

/**
 * One assignable role, as the selects need it.
 *
 * Read from the database rather than listed here: the set is no longer fixed,
 * and a hard-coded list would silently omit every role a practice defines.
 */
export type RoleOption = { value: string; label: string };

/**
 * The options for a role select. "none" reads differently depending on the
 * screen — "No role yet" for someone being invited, "No role" for someone
 * already here — so it is a parameter.
 */
export function roleOptions(noneLabel: string, roles: RoleOption[]): RoleOption[] {
  return [{ value: NO_ROLE, label: noneLabel }, ...roles];
}
