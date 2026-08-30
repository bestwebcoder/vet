/**
 * The registry of editable public-site copy. Adding a new editable field is
 * a code change here — one entry — never a migration: `site_content` stores
 * whatever keys exist in this list, and any key without a stored row falls
 * back to its default here, computed against the practice's real name.
 */

/**
 * `page` uses the same keys as src/lib/page-sections.ts, so one editor can
 * show a page's text and its card lists together — they are two halves of the
 * same page, and were previously edited in two different places.
 */
export type SiteContentPage = "home" | "about" | "services" | "training" | "contact" | "footer";

export type SiteContentField = {
  key: string;
  page: SiteContentPage;
  label: string;
  multiline?: boolean;
  defaultValue: (practiceName: string) => string;
};

export const SITE_CONTENT_FIELDS: SiteContentField[] = [
  {
    key: "home.hero_title",
    page: "home",
    label: "Hero headline",
    defaultValue: () => "Veterinary care for your pet, organized in one place",
  },
  {
    key: "home.hero_subtitle",
    page: "home",
    label: "Hero subheading",
    multiline: true,
    defaultValue: (name) =>
      `Book appointments, keep track of vaccinations, and see your pet's full medical history — all from one account with ${name}.`,
  },
  {
    key: "home.cta_title",
    page: "home",
    label: "Closing call-to-action headline",
    defaultValue: () => "Ready to book your pet's next visit?",
  },
  {
    key: "home.cta_subtitle",
    page: "home",
    label: "Closing call-to-action text",
    defaultValue: () => "Create an account in a couple of minutes — no paperwork required.",
  },
  {
    key: "about.intro",
    page: "about",
    label: "Introduction",
    multiline: true,
    defaultValue: (name) =>
      `${name} is a veterinary practice built around the appointment, not the paperwork — clinic consultations and home visits from real doctors, with every record kept in one place for the life of your pet.`,
  },
  {
    key: "about.how_we_work",
    page: "about",
    label: '"How we work" text',
    multiline: true,
    defaultValue: () =>
      "Booking is simple: choose a doctor, a time, and whether you'd rather come to the clinic or have the doctor come to you. From there, everything about that visit — the assessment, any prescription, vaccinations given, and the invoice — is recorded against your pet's own account, so you and your care team can always see the full picture.\n\nWe track vaccination and deworming schedules for you and send a reminder before the next one is due, so nothing falls through between visits.",
  },
  {
    key: "services.hero_eyebrow",
    page: "services",
    label: "Hero eyebrow",
    defaultValue: () => "Our Services",
  },
  {
    key: "services.hero_title",
    page: "services",
    label: "Hero headline (first line)",
    defaultValue: () => "Compassionate Veterinary Care",
  },
  {
    key: "services.hero_title_italic",
    page: "services",
    label: "Hero headline (second line, italic)",
    defaultValue: () => "Delivered to Your Doorstep",
  },
  {
    key: "services.intro",
    page: "services",
    label: "Hero introduction",
    multiline: true,
    defaultValue: () =>
      "Professional, personalised veterinary care in the comfort of your home — from preventive wellness to specialised consultations and clinical training.",
  },
  {
    key: "services.hero_cta",
    page: "services",
    label: "Hero button",
    defaultValue: () => "Schedule a Home Visit",
  },
  {
    key: "services.cta_title",
    page: "services",
    label: "Closing call-to-action headline",
    defaultValue: () => "Need Veterinary Care at Home?",
  },
  {
    key: "services.cta_subtitle",
    page: "services",
    label: "Closing call-to-action text",
    multiline: true,
    defaultValue: () =>
      "Contact us to schedule an appointment and provide your pet with personalised, professional care in a comfortable and familiar environment.",
  },
  {
    key: "services.cta_button",
    page: "services",
    label: "Closing call-to-action button",
    defaultValue: () => "Book a Home Visit",
  },
  {
    key: "training.hero_eyebrow",
    page: "training",
    label: "Hero eyebrow",
    defaultValue: () => "Training & Education",
  },
  {
    key: "training.hero_title",
    page: "training",
    label: "Hero headline (first line)",
    defaultValue: () => "Veterinary Knowledge",
  },
  {
    key: "training.hero_title_italic",
    page: "training",
    label: "Hero headline (second line, italic)",
    defaultValue: () => "Shared and Practised",
  },
  {
    key: "training.intro",
    page: "training",
    label: "Hero introduction",
    multiline: true,
    // Empty by default: the page falls back to the category's own description
    // from Admin → Services rather than saying it twice in different words.
    defaultValue: () => "",
  },
  {
    key: "training.hero_cta",
    page: "training",
    label: "Hero button",
    defaultValue: () => "Enquire About Training",
  },
  {
    key: "training.cta_title",
    page: "training",
    label: "Closing call-to-action headline",
    defaultValue: () => "Planning Training for Your Team?",
  },
  {
    key: "training.cta_subtitle",
    page: "training",
    label: "Closing call-to-action text",
    multiline: true,
    defaultValue: () =>
      "Tell us who you are training and what you would like covered, and we will put together a programme that fits your schedule.",
  },
  {
    key: "training.cta_button",
    page: "training",
    label: "Closing call-to-action button",
    defaultValue: () => "Get in Touch",
  },
  {
    key: "contact.intro",
    page: "contact",
    label: "Introduction",
    multiline: true,
    defaultValue: () => "Have a question before booking? Send us a message and we'll get back to you.",
  },
  {
    key: "footer.tagline",
    page: "footer",
    label: "Tagline",
    multiline: true,
    // Empty by default — nothing shows rather than inventing marketing copy.
    defaultValue: () => "",
  },
  {
    key: "footer.copyright_override",
    page: "footer",
    label: "Copyright line",
    defaultValue: (name) => `© ${new Date().getFullYear()} ${name}.`,
  },
];

export function siteContentValue(content: Record<string, string>, key: string, practiceName: string): string {
  const stored = content[key];
  if (stored) return stored;

  const field = SITE_CONTENT_FIELDS.find((candidate) => candidate.key === key);
  return field ? field.defaultValue(practiceName) : "";
}

/** The fields belonging to one page, in registry order. */
export function siteContentFieldsFor(page: string): SiteContentField[] {
  return SITE_CONTENT_FIELDS.filter((field) => field.page === page);
}
