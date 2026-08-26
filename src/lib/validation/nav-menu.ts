import { z } from "zod";

/**
 * A plain string, not a "target type" enum: "/about" (a fixed page),
 * "/our-clinic" (a published custom page's slug) and "https://wa.me/..."
 * (an external link) are all just hrefs. The admin picks from a combobox of
 * known internal targets but can always type anything else instead — this
 * only rejects the obviously-wrong (blank, or neither an internal path nor
 * a real absolute URL).
 */
export const navHrefSchema = z
  .string()
  .trim()
  .min(1, "Enter a link")
  .max(300, "Keep the link under 300 characters")
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\/.+/.test(value),
    "Enter a page path starting with / or a full https:// link",
  );

export const navLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a label")
  .max(40, "Keep the label under 40 characters");

export const navMenuItemSchema = z.object({
  label: navLabelSchema,
  href: navHrefSchema,
  isVisible: z.boolean(),
  opensNewTab: z.boolean(),
});

export type NavMenuItemInput = z.input<typeof navMenuItemSchema>;
export type NavMenuItemValues = z.output<typeof navMenuItemSchema>;

/**
 * The shape a drag-reorder submits: the whole tree in its new order, one
 * level of nesting only — matches the DB's own two-level cap
 * (nav_menu_items_enforce_depth_trigger).
 */
const navTreeChildSchema = z.object({ id: z.string().uuid() });

const navTreeTopItemSchema = z.object({
  id: z.string().uuid(),
  children: z.array(navTreeChildSchema).max(20, "Up to 20 items in a dropdown").default([]),
});

export const navMenuTreeSchema = z.array(navTreeTopItemSchema).max(20, "Up to 20 top-level menu items");

export type NavMenuTreeInput = z.output<typeof navMenuTreeSchema>;
