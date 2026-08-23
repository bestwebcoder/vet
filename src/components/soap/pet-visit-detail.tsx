import Link from "next/link";
import { notFound } from "next/navigation";

import { DiagnosisList } from "@/components/soap/diagnosis-list";
import { DiagnosticsList } from "@/components/soap/diagnostics-list";
import { SoapDetail } from "@/components/soap/soap-detail";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { listDiagnosesForAppointment, listDiagnosticsForAppointment, getSoapRecord } from "@/features/soap/queries";

/**
 * Read-only view of one visit's SOAP record — used by the Visit History tab
 * for all three roles. Editing happens from the appointment's own SOAP page
 * (doctor only); this view never offers it.
 */
export async function PetVisitDetail({
  petId,
  soapRecordId,
  backHref,
}: {
  petId: string;
  soapRecordId: string;
  backHref: string;
}) {
  const result = await getSoapRecord(soapRecordId);

  if (result.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }

  // Policy returns nothing for a record this person may not reach (a draft,
  // or someone else's patient), which is indistinguishable from one that
  // does not exist — as it should be. A mismatched pet_id is the same case.
  if (!result.data || result.data.petId !== petId) notFound();

  const record = result.data;

  const [diagnosesResult, diagnosticsResult] = await Promise.all([
    listDiagnosesForAppointment(record.appointmentId),
    listDiagnosticsForAppointment(record.appointmentId),
  ]);

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground text-sm">
        <Link href={backHref} className="underline underline-offset-4">
          Back to visit history
        </Link>
      </p>

      <SoapDetail record={record} />

      <DiagnosisList
        appointmentId={record.appointmentId}
        petId={petId}
        diagnoses={diagnosesResult.status === "ok" ? diagnosesResult.data : []}
        canEdit={false}
      />
      <DiagnosticsList
        appointmentId={record.appointmentId}
        petId={petId}
        tests={diagnosticsResult.status === "ok" ? diagnosticsResult.data : []}
        documents={[]}
        canEdit={false}
      />
    </div>
  );
}
