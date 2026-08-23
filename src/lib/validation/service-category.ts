import { z } from "zod";

/** §7.3 — an administrator-configurable service category. */

export const serviceCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name").max(100, "Keep it under 100 characters"),
});

export type ServiceCategoryInput = z.infer<typeof serviceCategorySchema>;

export function serviceCategoryToRow(data: ServiceCategoryInput) {
  return { name: data.name };
}
