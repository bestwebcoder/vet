import { PawPrint, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientDeactivateToggle } from "@/components/clients/client-deactivate-toggle";
import { PatientList } from "@/components/pets/patient-list";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getClientRecord } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";

export const metadata: Metadata = { title: "Client · TV Care" };

export default async function AdminClientDetailPage({
  params,
}: PageProps<"/admin/clients/[clientId]">) {
  await requireRole("admin", "super_admin");
  const { clientId } = await params;

  const result = await getClientRecord(clientId);
  if (result.status === "error" || !result.data) notFound();

  const client = result.data;
  const pets = await listPets({ clientId });

  const details = [
    { label: "Mobile", value: client.phone, numeric: true },
    { label: "Alternate", value: client.alternatePhone, numeric: true },
    { label: "Email", value: client.email },
    { label: "Address", value: client.address },
    { label: "City", value: client.city },
    {
      label: "Online account",
      // Whether this person can sign in is operationally useful: it decides
      // whether records reach them at all.
      value: client.userId ? "Registered" : "Not registered",
    },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2">
            {client.fullName}
            {!client.isActive ? <Badge variant="destructive">Deactivated</Badge> : null}
          </h1>
          <p className="text-muted-foreground">
            <Link href="/admin/clients" className="underline underline-offset-4">
              Back to clients
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/clients/${client.id}/edit`}
            className={buttonVariants({ variant: "outline", size: "touch" })}
          >
            <Pencil aria-hidden />
            Edit
          </Link>
          <ClientDeactivateToggle clientId={client.id} userId={client.userId} isActive={client.isActive} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground sm:mb-0.5">{detail.label}</dt>
                <dd
                  data-numeric={detail.numeric && detail.value ? "" : undefined}
                  className="text-right sm:text-left"
                >
                  {detail.value ?? "Not recorded"}
                </dd>
              </div>
            ))}
          </dl>
          {client.notes ? (
            <p className="text-muted-foreground mt-4 text-sm whitespace-pre-line">
              {client.notes}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="grid gap-1">
            <CardTitle className="text-base">Patients</CardTitle>
            <CardDescription>Animals registered to this client.</CardDescription>
          </div>
          <Link
            href={`/admin/clients/${client.id}/pets/new`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Plus aria-hidden />
            Add
          </Link>
        </CardHeader>
        <CardContent>
          {pets.status === "error" ? (
            <ErrorState title="Patients could not be loaded" />
          ) : (
            <PatientList
              pets={pets.data}
              basePath="/admin/patients"
              ownerNames={{ [client.id]: client.fullName }}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm">
        <PawPrint className="mr-1 inline size-4 align-[-3px]" aria-hidden />
        Clinical records live on each patient.
      </p>
    </div>
  );
}
