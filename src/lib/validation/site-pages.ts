import { z } from "zod";

import { fullNameSchema, optionalText } from "@/lib/validation/common";

/**
 * Slugs a custom page must not claim — every literal top-level route folder
 * under src/app, since Next.js prefers a literal match over the [slug]
 * dynamic route but a page claiming one of these would still be silently
 * unreachable rather than erroring, which is worse than rejecting it here.
 */
export const RESERVED_PAGE_SLUGS = [
  "about",
  "admin",
  "api",
  "auth",
  "client",
  "contact",
  "design-system",
  "doctor",
  "doctors",
  "no-access",
  "services",
  "login",
  "register",
  "forgot-password",
  "reset-password",
];

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a URL slug")
  .max(80, "Keep the URL slug under 80 characters")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only, e.g. careers or our-story")
  .refine((value) => !RESERVED_PAGE_SLUGS.includes(value), { message: "That URL is already used by the app" });

export const sitePageSettingsSchema = z.object({
  title: fullNameSchema,
  slug: slugSchema,
  showInNav: z.boolean(),
  isPublished: z.boolean(),
});

export type SitePageSettingsInput = z.input<typeof sitePageSettingsSchema>;
export type SitePageSettingsValues = z.output<typeof sitePageSettingsSchema>;

export const BLOCK_TYPES = ["text", "image", "section", "columns"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const textBlockSchema = z.object({
  heading: optionalText(150, "Heading"),
  body: z.string().trim().min(1, "Enter some text").max(4000, "Keep this under 4000 characters"),
});

export const imageBlockCaptionSchema = z.object({
  caption: optionalText(200, "Caption"),
});

export const sectionBlockSchema = z.object({
  heading: z.string().trim().min(1, "Enter a heading").max(150, "Keep the heading under 150 characters"),
  body: optionalText(2000, "Body text"),
});

const columnItemSchema = z.object({
  heading: optionalText(100, "Column heading"),
  body: optionalText(600, "Column text"),
});

export const columnsBlockSchema = z.object({
  items: z.array(columnItemSchema).min(2, "Add at least 2 columns").max(4, "Up to 4 columns"),
});
