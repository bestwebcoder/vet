import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatePrescriptionButton } from "@/components/prescriptions/create-button";
import { PrescriptionDetailView } from "@/components/prescriptions/prescription-detail";
import { PrescriptionForm } from "@/components/prescriptions/prescription-form";
import { PrescriptionItemList } from "@/components/prescriptions/prescription-item-list";
import { SignatureUpload } from "@/components/prescriptions/signature-upload";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { getAppointment } from "@/features/appointments/queries";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import {
  formattedVisitWeight,
  getCurrentPrescription,
  getPrescription,
  listMedications,
  listPrescriptionVersions,
  resolveVisitWeightGrams,
} from "@/features/prescriptions/queries";
import { getCurrentSoapRecord } from "@/features/soap/queries";

export const metadata: Metadata = { title: "Prescription · TV Care" };

export default async function PrescriptionPage({
  params,
  searchParams,
}: PageProps<"/doctor/appointments/[appointmentId]/prescription">) {
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

  const soapResult = await getCurrentSoapRecord(appointmentId);
  const hasFinalizedSoap = soapResult.status === "ok" && soapResult.data?.status === "finalized";

  if (!hasFinalizedSoap) {
    return (
      <div className="mx-auto grid w-full max-w-xl gap-6">
        <p className="text-muted-foreground text-sm">
          <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
            Back to appointment
          </Link>
        </p>
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title="Finalize the SOAP record first"
              description="A prescription is written from this visit's finalized SOAP record — finalize that before writing one."
              action={
                <Link
                  href={`/doctor/appointments/${appointmentId}/soap`}
                  className="text-sm underline underline-offset-4"
                >
                  Go to SOAP record
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [currentResult, doctorResult] = await Promise.all([getCurrentPrescription(appointmentId), getOwnDoctorRecord()]);
  const hasSignature = doctorResult.status === "ok" && Boolean(doctorResult.data?.signatureUrl);

  if (currentResult.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState />
        </CardContent>
      </Card>
    );
  }

  const requestedVersionId = typeof versionParam === "string" ? versionParam : null;
  let viewingPrescription = currentResult.data;
  if (requestedVersionId) {
    const requested = await getPrescription(requestedVersionId);
    viewingPrescription = requested.status === "ok" ? requested.data : null;
  }

  const isViewingCurrent = !requestedVersionId || viewingPrescription?.id === currentResult.data?.id;
  const versionsResult = currentResult.data ? await listPrescriptionVersions(appointmentId) : null;
  const versions = versionsResult?.status === "ok" ? versionsResult.data : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          <Link href={`/doctor/appointments/${appointmentId}`} className="underline underline-offset-4">
            Back to appointment
          </Link>
        </p>
        <h1>Prescription — {appointment.petName}</h1>
      </div>

      {!isViewingCurrent && viewingPrescription ? (
        <PrescriptionDetailView
          prescription={viewingPrescription}
          versions={versions}
          versionsBasePath={`/doctor/appointments/${appointmentId}/prescription`}
          canRevise={false}
        />
      ) : !currentResult.data ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title="No prescription yet"
              description="Start one to add medications for this visit."
              action={<CreatePrescriptionButton appointmentId={appointmentId} />}
            />
          </CardContent>
        </Card>
      ) : currentResult.data.status === "finalized" ? (
        <PrescriptionDetailView
          prescription={currentResult.data}
          versions={versions}
          versionsBasePath={`/doctor/appointments/${appointmentId}/prescription`}
          canRevise
        />
      ) : (
        <>
          {!hasSignature ? <SignatureUpload /> : null}
          <PrescriptionItemList
            prescriptionId={currentResult.data.id}
            appointmentId={appointmentId}
            petId={appointment.petId}
            items={currentResult.data.items}
            medications={await listMedications()}
            visitWeightGrams={await resolveVisitWeightGrams(appointmentId, appointment.petId)}
            visitWeightDisplay={await formattedVisitWeight(appointmentId, appointment.petId)}
            canEdit
          />
          <PrescriptionForm
            prescription={currentResult.data}
            appointmentId={appointmentId}
            hasItems={currentResult.data.items.length > 0}
          />
        </>
      )}
    </div>
  );
}
