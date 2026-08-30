import { z } from "zod";

import { ICON_KEYS } from "@/lib/icons";
import { optionalText } from "@/lib/validation/common";

/**
 * §7.3 — an administrator-configurable service category, which is also a
 * section heading on the public services page: hence the description and icon.
 */

export const serviceCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(100, "Keep it under 100 characters"),
  description: optionalText(500, "Description"),
  icon: z.enum(ICON_KEYS).nullish().transform((value) => value ?? null),
});

export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;

export function serviceCategoryToRow(data: ServiceCategoryInput) {
  return { name: data.name, description: data.description, icon: data.icon };
}
