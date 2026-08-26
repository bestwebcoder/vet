import type { Metadata } from "next";

import { ServiceCategoryManager } from "@/components/services/service-category-manager";
import { ServiceManager } from "@/components/services/service-form";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCESS } from "@/features/auth/access";
import { requireRole } from "@/features/auth/session";
import { listAllCategories } from "@/features/service-categories/queries";
import { listAllServices } from "@/features/services/queries";

export const metadata: Metadata = { title: "Services · TV Care" };

export default async function AdminServicesPage() {
  await requireRole(...ACCESS.reception);

  const [categoriesResult, servicesResult] = await Promise.all([listAllCategories(), listAllServices()]);

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
        <CardContent>
          {servicesResult.status === "error" || categoriesResult.status === "error" ? (
            <ErrorState title="Services could not be loaded" />
          ) : (
            <ServiceManager services={servicesResult.data} categories={categoriesResult.data} />
          )}
        </CardContent>
      </Card>

      {categoriesResult.status === "ok" ? <ServiceCategoryManager categories={categoriesResult.data} /> : null}
    </div>
  );
}
