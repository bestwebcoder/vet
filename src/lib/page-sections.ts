/**
 * Which card lists exist on which fixed marketing page, and how each one
 * renders. Adding a section to a page is a change here plus the code that
 * renders it — the `page` / `section` allowlists in the database
 * (20260916000100_page_sections.sql) are deliberately coarser than this
 * registry, the same split site_page_blocks uses: the coarse guard lives in
 * Postgres, the precise shape lives in TypeScript.
 *
 * Custom /[slug] pages are not here — they get the freeform block builder
 * (site_page_blocks) instead, including a "cards" block that renders the
 * same way these sections do.
 */

export const PAGE_KEYS = ["home", "about", "services", "contact"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export type SectionDefinition = {
  key: string;
  /** Tab label in the admin editor. */
  label: string;
  /** What this list is, in the admin editor, so it is obvious where it lands. */
  description: string;
  /**
   * False only for numbered lists, which show their position instead of a
   * picked icon — an icon field would have nothing to render into.
   */
  usesIcon: boolean;
};

export type PageDefinition = {
  key: PageKey;
  /** Heading in the admin editor. */
  label: string;
  /** The public page these sections render on. */
  href: string;
  /** One line under the heading, and on the card that links here from /admin/website. */
  blurb: string;
  sections: SectionDefinition[];
};

export const PAGE_SECTIONS: PageDefinition[] = [
  {
    key: "home",
    label: "Home page sections",
    href: "/",
    blurb: "“What we offer”, “Why pet owners choose” and “How it works” — reorder items and edit their text and pictures.",
    sections: [
      {
        key: "services",
        label: "What we offer",
        description: "The card grid under the hero, introducing what the practice does.",
        usesIcon: true,
      },
      {
        key: "why",
        label: "Why choose us",
        description: "Reasons to book, shown as a card grid further down the page.",
        usesIcon: true,
      },
      {
        key: "how_it_works",
        label: "How it works",
        description: "The numbered steps from signing up to seeing the visit afterward. Each item is numbered by its position, so it has no icon.",
        usesIcon: false,
      },
    ],
  },
  {
    key: "about",
    label: "About page sections",
    href: "/about",
    blurb: "The “What we stand for” cards between the introduction and “How we work”.",
    sections: [
      {
        key: "values",
        label: "What we stand for",
        description: "The card grid below the introduction on the About page.",
        usesIcon: true,
      },
    ],
  },
  {
    key: "services",
    label: "Services page sections",
    href: "/services",
    blurb: "Highlight cards shown above the priced service list.",
    sections: [
      {
        key: "highlights",
        label: "Service highlights",
        description:
          "Cards above the priced list — how visits work, what to bring, anything the price list itself cannot say. Leave empty and nothing renders.",
        usesIcon: true,
      },
    ],
  },
  {
    key: "contact",
    label: "Contact page sections",
    href: "/contact",
    blurb: "Extra cards beside the phone, email and address already taken from your practice details.",
    sections: [
      {
        key: "points",
        label: "Ways to reach us",
        description:
          "Cards below the contact details — opening hours, an emergency line, the areas you cover. Leave empty and nothing renders.",
        usesIcon: true,
      },
    ],
  },
];

export function pageDefinition(page: string): PageDefinition | undefined {
  return PAGE_SECTIONS.find((candidate) => candidate.key === page);
}

export function sectionDefinition(page: string, section: string): SectionDefinition | undefined {
  return pageDefinition(page)?.sections.find((candidate) => candidate.key === section);
}

export function isPageKey(value: string): value is PageKey {
  return PAGE_KEYS.includes(value as PageKey);
}
