import type { ServiceSummary } from "@/features/services/queries";

/**
 * What the public service pages share: how a flat list of services becomes
 * headed categories, which categories read as advisory work, and which ones
 * have left /services for a page of their own.
 *
 * It lives apart from either page because the two have to agree — /services
 * skips exactly what a dedicated page renders, and both group and accent the
 * cards the same way. Two copies of that drift the first time a category is
 * renamed.
 */

export type CategoryGroup = {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  services: ServiceSummary[];
};

/**
 * Groups by category, in the order an admin arranged them on the Services
 * screen. Uncategorised services collect under "Other" and sort last — it is
 * where anything unfiled falls, not a heading the practice chose.
 */
export function intoCategories(services: ServiceSummary[]): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const service of services) {
    const key = service.categoryId ?? "other";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: service.categoryName ?? "Other services",
        description: service.categoryDescription,
        icon: service.categoryIcon,
        sortOrder: service.categoryId ? service.categorySortOrder : Number.MAX_SAFE_INTEGER,
        services: [],
      });
    }

    groups.get(key)!.services.push(service);
  }

  return [...groups.values()].sort((a, b) =>
    a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder,
  );
}

/** Categories rendered in gold, two-up: advisory work rather than treatment. */
const ADVISORY_CATEGORIES = ["consulting", "training", "education", "mentorship"];

export function isAdvisoryCategory(name: string): boolean {
  const lower = name.toLowerCase();
  return ADVISORY_CATEGORIES.some((word) => lower.includes(word));
}

/**
 * Service categories that get a public page of their own rather than a section
 * on /services.
 *
 * Teaching work is not a service somebody books for their pet: it is bought by
 * a clinic for its staff or by a university for its students, and it reads
 * badly sandwiched between a home visit and a vaccination. So the catalogue
 * page hands it off to its own route, and the two pages agree on the handoff
 * by reading this list.
 *
 * Matching is by name, not by id: a category id belongs to one practice and
 * this file ships to all of them, so a hard-coded uuid would leave the page
 * blank for everyone but the first — the same reason the advisory rule above
 * reads names.
 */
export type DedicatedServicePage = {
  /** The public route the category is rendered on. */
  href: string;
  /**
   * The key its copy is stored under in site_content, and the key of its entry
   * in the website editor — see SITE_CONTENT_FIELDS and PAGE_SECTIONS.
   */
  contentPage: string;
  /** A category lands on that page when its name contains one of these words. */
  keywords: string[];
};

export const DEDICATED_SERVICE_PAGES: DedicatedServicePage[] = [
  { href: "/training-education", contentPage: "training", keywords: ["training", "education", "mentorship"] },
];

/** The page a category has of its own, if it has one. */
export function dedicatedServicePageFor(categoryName: string): DedicatedServicePage | undefined {
  const lower = categoryName.toLowerCase();
  return DEDICATED_SERVICE_PAGES.find((page) => page.keywords.some((word) => lower.includes(word)));
}

/** The categories that belong to one dedicated page, in catalogue order. */
export function categoriesFor(categories: CategoryGroup[], href: string): CategoryGroup[] {
  return categories.filter((category) => dedicatedServicePageFor(category.name)?.href === href);
}

/** The categories /services still shows — everything without a page of its own. */
export function categoriesForCatalogue(categories: CategoryGroup[]): CategoryGroup[] {
  return categories.filter((category) => dedicatedServicePageFor(category.name) === undefined);
}
