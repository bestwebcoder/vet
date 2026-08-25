import { z } from "zod";

import { uuidSchema } from "@/lib/validation/common";

/**
 * "none" removes every active role grant in the practice without adding a
 * new one — the same soft-revoke deactivateDoctorAction and
 * deactivateClientAction already use, surfaced here as a fourth option
 * alongside the roles admins can actually assign in the UI.
 */
export const ASSIGNABLE_ROLE_SLUGS = ["none", "client", "doctor", "admin"] as const;
export type AssignableRoleSlug = (typeof ASSIGNABLE_ROLE_SLUGS)[number];

export const setTeamRoleSchema = z.object({
  userId: uuidSchema,
  role: z.enum(ASSIGNABLE_ROLE_SLUGS, "Choose a role"),
});

export type SetTeamRoleInput = z.input<typeof setTeamRoleSchema>;
export type SetTeamRoleValues = z.output<typeof setTeamRoleSchema>;
