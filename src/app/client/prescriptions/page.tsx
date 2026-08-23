import { format } from "date-fns";
import { Download, FileText, Printer } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnClientRecord } from "@/features/clients/queries";
import { listPets } from "@/features/pets/queries";
import { listPrescriptionsForPet, signedPrescriptionPdfUrl } from "@/features/prescriptions/queries";

export const metadata: Metadata = { title: "Prescriptions · TV Care" };

export default async function ClientPrescriptionsPage() {
  await requireRole("client");

  const client = await getOwnClientRecord();

  if (client.status === "error" || !client.data) {
    return (
      <Card>
        <CardContent>
          <ErrorState
            title="We could not load your prescriptions"
            description="Your client record could not be found. Please contact your clinic."
          />
        </CardContent>
      </Card>
    );
  }

  const pets = await listPets({ clientId: client.data.id });
  if (pets.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your pets could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  const byPet = await Promise.all(pets.data.map((pet) => listPrescriptionsForPet(pet.id)));

  const prescriptions = pets.data
    .flatMap((pet, index) => {
      const result = byPet[index];
      if (result.status !== "ok") return [];
      return result.data.map((prescription) => ({ pet, prescription }));
    })
    .sort((a, b) => b.prescription.createdAt.localeCompare(a.prescription.createdAt));

  const pdfLinks = await Promise.all(
    prescriptions.map(({ prescription }) =>
      prescription.pdfPath ? signedPrescriptionPdfUrl(prescription.pdfPath) : null,
    ),
  );

  return (
    <div className="grid gap-6">
      <h1>Prescriptions</h1>

      {prescriptions.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="No prescriptions yet"
              description="Finalized prescriptions for your pets will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {prescriptions.map(({ pet, prescription }, index) => (
            <Card key={prescription.id}>
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {pet.name} · {prescription.prescriptionNumber}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Dr. {prescription.doctorName} · {format(new Date(prescription.createdAt), "d MMM yyyy")}
                    </p>
                  </div>
                </div>

                <p className="text-muted-foreground text-sm">
                  {prescription.items.map((item) => item.drugName).join(", ") || "No medications recorded"}
                </p>

                {pdfLinks[index] ? (
                  <div className="flex flex-wrap gap-3 pt-2">
                    <a href={pdfLinks[index]!} download className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Download aria-hidden />
                      Download
                    </a>
                    <a
                      href={pdfLinks[index]!}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Printer aria-hidden />
                      Print
                    </a>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
