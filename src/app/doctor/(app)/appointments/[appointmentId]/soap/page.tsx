import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DiagnosisList } from "@/components/soap/diagnosis-list";
import { DiagnosticsList } from "@/components/soap/diagnostics-list";
import { ReviseSoapButton } from "@/components/soap/revise-button";
import { SoapDetail } from "@/components/soap/soap-detail";
import { SoapForm } from "@/components/soap/soap-form";
import { ErrorState } from "@/components/states/error-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointment } from "@/features/appointments/queries";
import { requireRole } from "@/features/auth/session";
import { listDocuments } from "@/features/documents/queries";
import {
  getCurrentSoapRecord,
  getSoapRecord,
  listDiagnosesForAppointment,
  listDiagnosticsForAppointment,
  listSoapVersions,
} from "@/features/soap/queries";

export const metadata: Metadata = { title: "SOAP record · TV Care" };

export default async function SoapRecordPage({
  params,
  searchParams,
}: PageProps<"/doctor/appointments/[appointmentId]/soap">) {
  await requireRole("doctor");
  const { appointmentId } = await params;
  const { version: versionParam } = await searchParams;

  const appointmentResult = await getAppointment(appointmentId);
  if (appointmentResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }
  if (!appointmentResult.data) notFound();
  const appointment = appointmentResult.data;

  const [currentResult, versionsResult, diagnosesResult, diagnosticsResult, documentsResult] = await Promise.all([
    getCurrentSoapRecord(appointmentId),
    listSoapVersions(appointmentId),
    listDiagnosesForAppointment(appointmentId),
    listDiagnosticsForAppointment(appointmentId),
    listDocuments(appointment.petId),
  ]);

  if (currentResult.status === "error" || versionsResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }

  const requestedVersionId = typeof versionParam === "string" ? versionParam : null;
  let viewingRecord = currentResult.data;

  if (requestedVersionId) {
    const requested = await getSoapRecord(requestedVersionId);
    viewingRecord = requested.status === "ok" ? requested.data : null;
  }

  const diagnoses = diagnosesResult.status === "ok" ? diagnosesResult.data : [];
  const diagnostics = diagnosticsResult.status === "ok" ? diagnosticsResult.data : [];
  const documents = documentsResult.status === "ok" ? documentsResult.data.map((d) => ({ id: d.id, fileName: d.fileName })) : [];

  const isViewingCurrent = !requestedVersionId || viewingRecord?.id === currentResult.data?.id;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
            Back to appointment
          </Link>
        </p>
        <h1>SOAP record — {appointment.petName}</h1>
      </div>

      {!isViewingCurrent && viewingRecord ? (
        <SoapDetail
          record={viewingRecord}
          versions={versionsResult.data.map((v) => ({ id: v.id, version: v.version }))}
          versionsBasePath={`/doctor/appointments/${appointmentId}/soap`}
        />
      ) : currentResult.data?.status === "finalized" ? (
        <>
          <SoapDetail
            record={currentResult.data}
            versions={versionsResult.data.map((v) => ({ id: v.id, version: v.version }))}
            versionsBasePath={`/doctor/appointments/${appointmentId}/soap`}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {currentResult.data.followUpNeeded && !currentResult.data.followUpScheduledAt ? (
              <Link
                href={`/doctor/appointments/new?petId=${appointment.petId}&visitType=follow_up&reason=${encodeURIComponent(currentResult.data.followUpNotes ?? "Follow-up visit")}&soapRecordId=${currentResult.data.id}`}
                className={buttonVariants({ variant: "outline", size: "touch" })}
              >
                <CalendarPlus aria-hidden />
                Schedule follow-up
              </Link>
            ) : null}
            <ReviseSoapButton soapRecordId={currentResult.data.id} />
          </div>
        </>
      ) : (
        <SoapForm appointmentId={appointmentId} petName={appointment.petName} soapRecord={currentResult.data ?? undefined} />
      )}

      <DiagnosisList appointmentId={appointmentId} petId={appointment.petId} diagnoses={diagnoses} canEdit />
      <DiagnosticsList
        appointmentId={appointmentId}
        petId={appointment.petId}
        tests={diagnostics}
        documents={documents}
        canEdit
      />
    </div>
  );
}
