import { format } from "date-fns";
import { Download, Printer } from "lucide-react";
import Link from "next/link";

import { RevisePrescriptionButton } from "@/components/prescriptions/revise-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signedPrescriptionPdfUrl, type PrescriptionDetail } from "@/features/prescriptions/queries";

/** Read-only rendering of one prescription version, with Download/Print and (staff only) Revise. */
export async function PrescriptionDetailView({
  prescription,
  versions,
  versionsBasePath,
  canRevise,
}: {
  prescription: PrescriptionDetail;
  versions?: { id: string; version: number }[];
  versionsBasePath?: string;
  canRevise: boolean;
}) {
  const pdfUrl = prescription.pdfPath ? await signedPrescriptionPdfUrl(prescription.pdfPath) : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{prescription.prescriptionNumber}</p>
          <p className="text-muted-foreground text-sm">
            Dr. {prescription.doctorName} · {format(new Date(prescription.createdAt), "d MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prescription.status === "draft" ? <Badge variant="secondary">Draft</Badge> : <Badge>Finalized</Badge>}
          <Badge variant="outline">Version {prescription.version}</Badge>
        </div>
      </div>

      {versions && versions.length > 1 && versionsBasePath ? (
        <div className="flex flex-wrap gap-2">
          {versions.map((version) => (
            <Link
              key={version.id}
              href={`${versionsBasePath}?version=${version.id}`}
              className={`rounded-md border px-2.5 py-1 text-xs ${version.id === prescription.id ? "border-primary text-primary" : "text-muted-foreground"}`}
            >
              Version {version.version}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{prescription.petName}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-muted-foreground">
            {[prescription.speciesName, prescription.breedName].filter(Boolean).join(" · ") || "Species not recorded"}
          </p>
          <ul className="grid gap-2">
            {prescription.items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                <p className="font-medium">{item.drugName}</p>
                <p className="text-muted-foreground text-xs">
                  {[item.strength, item.formulation].filter(Boolean).join(" · ")}
                </p>
                <p className="text-muted-foreground text-xs" data-numeric>
                  {item.computedDose != null
                    ? `${item.computedDose}${item.doseUnit ?? ""}`
                    : item.dosePerKg != null
                      ? `${item.dosePerKg}${item.doseUnit ?? ""}/kg`
                      : "No dose recorded"}
                  {item.route ? ` · ${item.route}` : ""}
                  {item.frequency ? ` · ${item.frequency}` : ""}
                  {item.duration ? ` · ${item.duration}` : ""}
                </p>
                {item.instructions ? <p className="text-sm">{item.instructions}</p> : null}
              </li>
            ))}
          </ul>
          {prescription.instructions ? (
            <div>
              <p className="text-muted-foreground text-xs">Instructions</p>
              <p>{prescription.instructions}</p>
            </div>
          ) : null}
          {prescription.followUpDate ? (
            <div>
              <p className="text-muted-foreground text-xs">Follow-up date</p>
              <p data-numeric>{format(new Date(prescription.followUpDate), "d MMM yyyy")}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {pdfUrl ? (
        <div className="flex flex-wrap gap-3">
          <a href={pdfUrl} download className={buttonVariants({ variant: "outline", size: "touch" })}>
            <Download aria-hidden />
            Download PDF
          </a>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "touch" })}>
            <Printer aria-hidden />
            Print PDF
          </a>
        </div>
      ) : null}

      {canRevise && prescription.status === "finalized" ? (
        <RevisePrescriptionButton prescriptionId={prescription.id} />
      ) : null}
    </div>
  );
}
