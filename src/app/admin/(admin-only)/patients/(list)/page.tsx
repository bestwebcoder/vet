import type { Metadata } from "next";
import Link from "next/link";

import { PatientList } from "@/components/pets/patient-list";
import { Pagination } from "@/components/search/pagination";
import { SearchField } from "@/components/search/search-field";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Patients · TV Care" };

export default async function AdminPatientsPage({ searchParams }: PageProps<"/admin/patients">) {
  await requireRole("admin", "super_admin");

  const { q, show, page: pageParam } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const includeInactive = show === "all";
  const page = typeof pageParam === "string" ? Number(pageParam) || 1 : 1;

  const [pets, clients] = await Promise.all([
    listPets({ search, includeInactive, page, pageSize: 25 }),
    listClients({ limit: 500 }),
  ]);

  // Owner names are resolved separately rather than embedded: the pets query is
  // already scoped by policy, and this keeps one shape for every caller.
  const ownerNames = Object.fromEntries(
    (clients.status === "ok" ? clients.data : []).map((client) => [client.id, client.fullName]),
  );

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Patients</h1>
        <p className="text-muted-foreground">Every animal registered with the practice.</p>
      </div>

      <SearchField
        action="/admin/patients"
        defaultValue={search}
        placeholder="Patient, owner, mobile number or microchip"
        label="Search patients"
      />

      <div className="flex gap-2">
        <Link
          href="/admin/patients"
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            !includeInactive ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
          )}
        >
          Active
        </Link>
        <Link
          href="/admin/patients?show=all"
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            includeInactive ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
          )}
        >
          Include archived
        </Link>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          {pets.status === "error" ? (
            <ErrorState title="Patients could not be loaded" />
          ) : (
            <>
              <PatientList
                pets={pets.data}
                basePath="/admin/patients"
                ownerNames={ownerNames}
                search={search}
              />
              <Pagination
                basePath="/admin/patients"
                searchParams={{ q: search, show: includeInactive ? "all" : undefined }}
                page={pets.page}
                pageSize={pets.pageSize}
                totalCount={pets.totalCount}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
