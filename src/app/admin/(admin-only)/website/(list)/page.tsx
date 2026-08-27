import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/search/pagination";
import { SitePagesList } from "@/components/site-pages/site-pages-list";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { countPageSectionItemsForAdmin } from "@/features/page-sections/queries";
import { listSitePagesForAdmin } from "@/features/site-pages/queries";
import { PAGE_SECTIONS } from "@/lib/page-sections";

export const metadata: Metadata = { title: "Website · TV Care" };

/** Pages of your own are unbounded; the five fixed ones above never are. */
const PAGE_SIZE = 20;

export default async function AdminWebsitePage({ searchParams }: PageProps<"/admin/website">) {
  const user = await requireRole("admin", "super_admin");
  const organizationId = user.organizationIds[0];

  if (!organizationId) {
    return (
      <div className="grid gap-6">
        <h1>Website</h1>
        <p className="text-muted-foreground">Your account is not linked to a practice yet.</p>
      </div>
    );
  }

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;

  const [sitePages, sectionCounts] = await Promise.all([
    listSitePagesForAdmin(organizationId),
    countPageSectionItemsForAdmin(organizationId),
  ]);

  // A page beyond the end is clamped to the last one rather than rendered
  // blank: with a single page of results the control hides itself, so an
  // out-of-range ?page would otherwise be a dead end with no way back.
  const customPageCount = sitePages.status === "ok" ? sitePages.data.length : 0;
  const totalPages = Math.max(1, Math.ceil(customPageCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Website</h1>
        <p className="text-muted-foreground">Everything shown on the public marketing site.</p>
      </div>

      <Link href="/admin/website/navigation" className="block">
        <Card className="transition-colors hover:bg-muted/50">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div className="grid gap-1.5">
              <CardTitle className="text-base">Navigation</CardTitle>
              <CardDescription>What shows in the header, mobile menu and footer — reorder items and build dropdowns.</CardDescription>
            </div>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
          </CardHeader>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pages</CardTitle>
          <CardDescription>
            Each page in one place — its headings and body text, and the card lists it renders.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {PAGE_SECTIONS.map((definition) => {
            const count =
              definition.sections.length === 0 || sectionCounts.status !== "ok"
                ? null
                : sectionCounts.data[definition.key];
            return (
              <Link key={definition.key} href={`/admin/website/sections/${definition.key}`} className="block">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                    <div className="grid gap-1.5">
                      <CardTitle className="text-base">{definition.label}</CardTitle>
                      <CardDescription>{definition.blurb}</CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {count === null ? null : (
                        <span className="text-muted-foreground text-sm tabular-nums">
                          {count} {count === 1 ? "item" : "items"}
                        </span>
                      )}
                      <ChevronRight className="text-muted-foreground size-5" aria-hidden />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">Custom pages</CardTitle>
            <CardDescription>
              Pages of your own, built from blocks — text, images, section headings, columns and card grids.
            </CardDescription>
          </div>
          <Link href="/admin/website/pages/new" className={buttonVariants({ size: "touch" })}>
            <Plus aria-hidden />
            New page
          </Link>
        </CardHeader>
        <CardContent className="grid gap-4">
          {sitePages.status === "ok" ? (
            <>
              <SitePagesList pages={sitePages.data.slice(start, start + PAGE_SIZE)} />
              <Pagination
                basePath="/admin/website"
                searchParams={{}}
                page={currentPage}
                pageSize={PAGE_SIZE}
                totalCount={customPageCount}
              />
            </>
          ) : (
            <ErrorState title="Custom pages could not be loaded" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
