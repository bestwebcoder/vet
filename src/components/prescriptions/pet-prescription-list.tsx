import { format } from "date-fns";
import { Download, FileText, Printer } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listPrescriptionsForPet, signedPrescriptionPdfUrl } from "@/features/prescriptions/queries";

/** The current version of every prescription for a pet, newest first — the Prescriptions tab. */
export async function PetPrescriptionList({ petId }: { petId: string }) {
  const result = await listPrescriptionsForPet(petId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Prescriptions could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  if (result.data.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={FileText}
            title="No prescriptions yet"
            description="Finalized prescriptions from this patient's visits will appear here."
          />
        </CardContent>
      </Card>
    );
  }

  const pdfLinks = await Promise.all(
    result.data.map((prescription) => (prescription.pdfPath ? signedPrescriptionPdfUrl(prescription.pdfPath) : null)),
  );

  return (
    <div className="grid gap-4">
      {result.data.map((prescription, index) => (
        <Card key={prescription.id}>
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{prescription.prescriptionNumber}</p>
                <p className="text-muted-foreground text-sm">
                  Dr. {prescription.doctorName} · {format(new Date(prescription.createdAt), "d MMM yyyy")}
                </p>
              </div>
              <Badge variant={prescription.status === "finalized" ? "default" : "secondary"}>
                {prescription.status === "finalized" ? "Finalized" : "Draft"}
              </Badge>
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
  );
}
