/**
 * The nine tabs of a patient record, from the brief.
 *
 * Defined once and given a base path, so the client portal and the clinic-side
 * views cannot end up with different tabs for the same patient.
 */

export type PetTab = {
  slug: string;
  label: string;
  /** The phase that fills this tab in. Absent means it is built. */
  phase?: number;
};

export const PET_TABS: PetTab[] = [
  { slug: "", label: "Overview" },
  { slug: "medical-history", label: "Medical History" },
  { slug: "visits", label: "Visit History" },
  { slug: "prescriptions", label: "Prescriptions" },
  { slug: "vaccinations", label: "Vaccinations" },
  { slug: "deworming", label: "Deworming" },
  { slug: "diagnostics", label: "Diagnostics" },
  { slug: "documents", label: "Documents" },
  { slug: "billing", label: "Billing" },
];

export function petTabHref(basePath: string, slug: string) {
  return slug === "" ? basePath : `${basePath}/${slug}`;
}

export function findPetTab(slug: string): PetTab | undefined {
  return PET_TABS.find((tab) => tab.slug === slug);
}
