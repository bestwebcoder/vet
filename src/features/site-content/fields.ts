/**
 * The registry of editable public-site copy. Adding a new editable field is
 * a code change here — one entry — never a migration: `site_content` stores
 * whatever keys exist in this list, and any key without a stored row falls
 * back to its default here, computed against the practice's real name.
 */

export type SiteContentField = {
  key: string;
  page: "Home" | "About" | "Services" | "Contact" | "Footer";
  label: string;
  multiline?: boolean;
  defaultValue: (practiceName: string) => string;
};

export const SITE_CONTENT_FIELDS: SiteContentField[] = [
  {
    key: "home.hero_title",
    page: "Home",
    label: "Hero headline",
    defaultValue: () => "Veterinary care for your pet, organized in one place",
  },
  {
    key: "home.hero_subtitle",
    page: "Home",
    label: "Hero subheading",
    multiline: true,
    defaultValue: (name) =>
      `Book appointments, keep track of vaccinations, and see your pet's full medical history — all from one account with ${name}.`,
  },
  {
    key: "home.cta_title",
    page: "Home",
    label: "Closing call-to-action headline",
    defaultValue: () => "Ready to book your pet's next visit?",
  },
  {
    key: "home.cta_subtitle",
    page: "Home",
    label: "Closing call-to-action text",
    defaultValue: () => "Create an account in a couple of minutes — no paperwork required.",
  },
  {
    key: "about.intro",
    page: "About",
    label: "Introduction",
    multiline: true,
    defaultValue: (name) =>
      `${name} is a veterinary practice built around the appointment, not the paperwork — clinic consultations and home visits from real doctors, with every record kept in one place for the life of your pet.`,
  },
  {
    key: "about.how_we_work",
    page: "About",
    label: '"How we work" text',
    multiline: true,
    defaultValue: () =>
      "Booking is simple: choose a doctor, a time, and whether you'd rather come to the clinic or have the doctor come to you. From there, everything about that visit — the assessment, any prescription, vaccinations given, and the invoice — is recorded against your pet's own account, so you and your care team can always see the full picture.\n\nWe track vaccination and deworming schedules for you and send a reminder before the next one is due, so nothing falls through between visits.",
  },
  {
    key: "services.intro",
    page: "Services",
    label: "Introduction",
    multiline: true,
    defaultValue: (name) =>
      `Every service ${name} offers, with real pricing — clinic and home visits both available where noted.`,
  },
  {
    key: "contact.intro",
    page: "Contact",
    label: "Introduction",
    multiline: true,
    defaultValue: () => "Have a question before booking? Send us a message and we'll get back to you.",
  },
  {
    key: "footer.tagline",
    page: "Footer",
    label: "Tagline",
    multiline: true,
    // Empty by default — nothing shows rather than inventing marketing copy.
    defaultValue: () => "",
  },
  {
    key: "footer.copyright_override",
    page: "Footer",
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
