import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ClientList } from "@/components/clients/client-list";
import { SearchField } from "@/components/search/search-field";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";

export const metadata: Metadata = { title: "Clients · TV Care" };

export default async function AdminClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  await requireRole("admin", "super_admin");

  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const result = await listClients({ search });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>Clients</h1>
          <p className="text-muted-foreground">Everyone registered with the practice.</p>
        </div>

        <Link
          href="/admin/clients/new"
          className={buttonVariants({ size: "touch", className: "w-full sm:w-auto" })}
        >
          <Plus aria-hidden />
          Add a client
        </Link>
      </div>

      <SearchField
        action="/admin/clients"
        defaultValue={search}
        placeholder="Name, mobile number or email"
        label="Search clients"
      />

      <Card>
        <CardContent>
          {result.status === "error" ? (
            <ErrorState title="Clients could not be loaded" />
          ) : (
            <ClientList clients={result.data} basePath="/admin/clients" search={search} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
