import { z } from "zod";

import { ICON_KEYS } from "@/lib/icons";

export const HOME_SECTIONS = ["services", "why", "how_it_works"] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

export const homeSectionItemSchema = z
  .object({
    section: z.enum(HOME_SECTIONS),
    icon: z.enum(ICON_KEYS).nullable(),
    title: z.string().trim().min(1, "Enter a title").max(80, "Keep the title under 80 characters"),
    description: z.string().trim().min(1, "Enter a description").max(300, "Keep the description under 300 characters"),
  })
  // How it works shows its position as a step number instead of an icon;
  // Services and Why always need one so the grid doesn't have an empty slot.
  .refine((value) => value.section === "how_it_works" || value.icon !== null, {
    message: "Choose an icon",
    path: ["icon"],
  });

export type HomeSectionItemInput = z.input<typeof homeSectionItemSchema>;
export type HomeSectionItemValues = z.output<typeof homeSectionItemSchema>;
