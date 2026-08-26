import { z } from "zod";

import { sectionDefinition } from "@/lib/page-sections";
import { ICON_KEYS } from "@/lib/icons";

export const pageSectionItemSchema = z
  .object({
    page: z.string().trim().min(1),
    section: z.string().trim().min(1),
    icon: z.enum(ICON_KEYS).nullable(),
    title: z.string().trim().min(1, "Enter a title").max(80, "Keep the title under 80 characters"),
    description: z.string().trim().min(1, "Enter a description").max(300, "Keep the description under 300 characters"),
  })
  // A page/section pair the registry does not know would insert a row nothing
  // renders, so reject it here rather than let it reach the table's (coarser)
  // check constraint and surface as a database error.
  .refine((value) => sectionDefinition(value.page, value.section) !== undefined, {
    message: "That section does not exist on that page",
    path: ["section"],
  })
  // Sections that render a picked icon always need one, so the card grid never
  // has an empty slot; numbered sections show their position instead.
  .refine((value) => !sectionDefinition(value.page, value.section)?.usesIcon || value.icon !== null, {
    message: "Choose an icon",
    path: ["icon"],
  });

export type PageSectionItemInput = z.input<typeof pageSectionItemSchema>;
export type PageSectionItemValues = z.output<typeof pageSectionItemSchema>;
