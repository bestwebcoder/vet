/**
 * The Data screen's sections.
 *
 * Sub-routes rather than client-side tabs, the same shape a patient record
 * uses: the audit log and the archive both take filters and page numbers, and
 * those belong in a URL a person can bookmark, share with a colleague, or open
 * again after a refresh.
 */

export type DataTab = {
  slug: string;
  label: string;
  description: string;
};

export const DATA_TABS: DataTab[] = [
  { slug: "", label: "Backup", description: "Download a copy of everything this practice holds." },
  { slug: "import", label: "Import", description: "Bring clients, patients and services in from a spreadsheet." },
  { slug: "health", label: "Health", description: "What is in the database, table by table." },
  { slug: "archive", label: "Archive", description: "Records that were deleted, and how to get them back." },
  { slug: "audit", label: "Audit log", description: "Who changed what, and when." },
];

export function dataTabHref(slug: string) {
  return slug === "" ? "/admin/data" : `/admin/data/${slug}`;
}
