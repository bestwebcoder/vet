import { z } from "zod";

import { optionalText } from "@/lib/validation/common";

/**
 * A role a practice defines for itself.
 *
 * Only a name and a description: what the role can actually do is the
 * permission matrix beside this form, not a field on it.
 */
export const roleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a role name")
    .max(60, "Keep the name under 60 characters"),
  description: optionalText(200, "Description"),
});

export type RoleInput = z.input<typeof roleSchema>;
export type RoleValues = z.output<typeof roleSchema>;

/**
 * Derived from the name rather than typed, the same as branchSlug: it is a
 * stable per-practice key that is never shown, so asking an administrator to
 * invent one would be asking for something they cannot judge.
 *
 * Underscores, not hyphens — roles_slug_format matches the built-in slugs
 * (`finance_manager`), which is the shape every role predicate in the schema
 * already reads.
 */
export function slugForRole(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  // A name of only punctuation would produce an empty slug, which the check
  // constraint rejects. The suffix also keeps a renamed-then-recreated role
  // from colliding with the soft-deleted one it replaces.
  return base ? `${base}_${Date.now().toString(36)}` : `role_${Date.now().toString(36)}`;
}
