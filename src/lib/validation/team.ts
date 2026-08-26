import { z } from "zod";

import { emailSchema, fullNameSchema, optionalText, phoneSchema, uuidSchema } from "@/lib/validation/common";

/**
 * "none" removes every active role grant in the practice without adding a
 * new one — the same soft-revoke deactivateDoctorAction and
 * deactivateClientAction already use, surfaced here alongside the roles
 * admins can actually assign in the UI.
 */
export const ASSIGNABLE_ROLE_SLUGS = [
  "none",
  "client",
  "doctor",
  "admin",
  "finance_manager",
  "lab",
  "receptionist",
] as const;
export type AssignableRoleSlug = (typeof ASSIGNABLE_ROLE_SLUGS)[number];

export const setTeamRoleSchema = z.object({
  userId: uuidSchema,
  role: z.enum(ASSIGNABLE_ROLE_SLUGS, "Choose a role"),
});

export type SetTeamRoleInput = z.input<typeof setTeamRoleSchema>;
export type SetTeamRoleValues = z.output<typeof setTeamRoleSchema>;

export const inviteTeamMemberSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  jobTitle: optionalText(120, "Job title"),
  role: z.enum(ASSIGNABLE_ROLE_SLUGS, "Choose a role"),
});

export type InviteTeamMemberInput = z.input<typeof inviteTeamMemberSchema>;
export type InviteTeamMemberValues = z.output<typeof inviteTeamMemberSchema>;

/**
 * Labels for the role select, in one place: the invite dialog and the roster
 * table both render this list, and two copies drifted the moment a role was
 * added. "none" reads differently in each — "No role yet" for someone being
 * invited, "No role" for someone already here — so it is a parameter.
 */
export const ROLE_LABELS: Record<Exclude<AssignableRoleSlug, "none">, string> = {
  client: "Client",
  doctor: "Doctor",
  admin: "Admin",
  finance_manager: "Finance Manager",
  lab: "Lab",
  receptionist: "Receptionist",
};

export function roleOptions(noneLabel: string): { value: AssignableRoleSlug; label: string }[] {
  return [
    { value: "none" as const, label: noneLabel },
    ...ASSIGNABLE_ROLE_SLUGS.filter((slug) => slug !== "none").map((slug) => ({
      value: slug,
      label: ROLE_LABELS[slug as Exclude<AssignableRoleSlug, "none">],
    })),
  ];
}
