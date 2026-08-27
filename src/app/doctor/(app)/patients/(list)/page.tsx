import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PatientList } from "@/components/pets/patient-list";
import { SearchField } from "@/components/search/search-field";
import { Pagination } from "@/components/search/pagination";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Patients · TV Care" };

export default async function DoctorPatientsPage({ searchParams }: PageProps<"/doctor/patients">) {
  await requireRole("doctor");

  const { q, show, page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;
  const search = typeof q === "string" ? q : undefined;
  const includeInactive = show === "all";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1>Patients</h1>
          <p className="text-muted-foreground">Every animal you can treat at this practice.</p>
        </div>

        <Link
          href="/doctor/patients/new"
          className={buttonVariants({ size: "touch", className: "w-full sm:w-auto" })}
        >
          <Plus aria-hidden />
          Add a patient
        </Link>
      </div>

      <SearchField
        action="/doctor/patients"
        defaultValue={search}
        placeholder="Patient, owner, mobile number or microchip"
        label="Search patients"
      />

      <div className="flex gap-2">
        <Link
          href="/doctor/patients"
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            !includeInactive ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
          )}
        >
          Active
        </Link>
        <Link
          href="/doctor/patients?show=all"
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
            <PatientList
              pets={pets.data}
              basePath="/doctor/patients"
              ownerNames={ownerNames}
              search={search}
            />
          )}
          <Pagination
            basePath="/doctor/patients"
            searchParams={{ q: typeof q === "string" ? q : undefined, show: typeof show === "string" ? show : undefined }}
            page={pets.status === "ok" ? pets.page : page}
            pageSize={pets.status === "ok" ? pets.pageSize : 25}
            totalCount={pets.status === "ok" ? pets.totalCount : 0}
          />
        </CardContent>
      </Card>
    </div>
  );
}
