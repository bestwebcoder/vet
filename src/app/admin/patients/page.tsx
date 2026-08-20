import type { Metadata } from "next";

import { PatientList } from "@/components/pets/patient-list";
import { SearchField } from "@/components/search/search-field";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listClients } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Patients · TV Care" };

export default async function AdminPatientsPage({ searchParams }: PageProps<"/admin/patients">) {
  await requireRole("admin", "super_admin");

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

      <Card>
        <CardContent>
          {pets.status === "error" ? (
            <ErrorState title="Patients could not be loaded" />
          ) : (
            <PatientList
              pets={pets.data}
              basePath="/admin/patients"
              ownerNames={ownerNames}
              search={search}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
