import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PatientList } from "@/components/pets/patient-list";
import { SearchField } from "@/components/search/search-field";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Patients · TV Care" };

export default async function DoctorPatientsPage({ searchParams }: PageProps<"/doctor/patients">) {
  await requireRole("doctor");

  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;

  const [pets, clients] = await Promise.all([listPets({ search }), listClients({ limit: 500 })]);

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

      <Card>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
