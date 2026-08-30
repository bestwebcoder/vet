import type { Metadata } from "next";

import { Pagination } from "@/components/search/pagination";
import { ServiceCategoryManager } from "@/components/services/service-category-manager";
import { ServiceManager } from "@/components/services/service-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccess } from "@/features/auth/access";
import { listAllCategories } from "@/features/service-categories/queries";
import { listServicesPage } from "@/features/services/queries";

export const metadata: Metadata = { title: "Services · TV Care" };

/** Categories are short enough to show in one go, but not always short enough for one screen. */
const CATEGORY_PAGE_SIZE = 20;

export default async function AdminServicesPage({ searchParams }: PageProps<"/admin/services">) {
  await requireAccess("reception");

  const params = await searchParams;
  const page = typeof params.page === "string" ? Number(params.page) || 1 : 1;
  const categoryPage = typeof params.categoryPage === "string" ? Number(params.categoryPage) || 1 : 1;

  // The catalog is paged in the database; categories are read in full because
  // the "Category" dropdown on every service row has to list all of them, and
  // a half-read list would silently drop the option a service already uses.
  const [categoriesResult, servicesResult] = await Promise.all([listAllCategories(), listServicesPage({ page })]);

  const categoryStart = (Math.max(1, categoryPage) - 1) * CATEGORY_PAGE_SIZE;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Services</h1>
        <p className="text-muted-foreground">
          Prices, categories and availability for every service the practice offers. Nothing here is hard-coded —
          booking and invoicing always read the current values.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service catalog</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {servicesResult.status === "error" || categoriesResult.status === "error" ? (
            <ErrorState title="Services could not be loaded" />
          ) : (
            <>
              <ServiceManager services={servicesResult.data} categories={categoriesResult.data} />
              <Pagination
                basePath="/admin/services"
                searchParams={{ categoryPage: typeof params.categoryPage === "string" ? params.categoryPage : undefined }}
                page={servicesResult.page}
                pageSize={servicesResult.pageSize}
                totalCount={servicesResult.totalCount}
              />
            </>
          )}
        </CardContent>
      </Card>

      {categoriesResult.status === "ok" ? (
        <ServiceCategoryManager
          categories={categoriesResult.data.slice(categoryStart, categoryStart + CATEGORY_PAGE_SIZE)}
          pagination={
            <Pagination
              basePath="/admin/services"
              searchParams={{ page: typeof params.page === "string" ? params.page : undefined }}
              page={Math.max(1, categoryPage)}
              pageSize={CATEGORY_PAGE_SIZE}
              totalCount={categoriesResult.data.length}
              pageParam="categoryPage"
            />
          }
        />
      ) : null}
    </div>
  );
}
