import type { Metadata } from "next";

import { PetVisitDetail } from "@/components/soap/pet-visit-detail";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit · TV Care" };

export default async function DoctorVisitDetailPage({
  params,
}: PageProps<"/doctor/patients/[petId]/visits/[soapRecordId]">) {
  await requireRole("doctor");
  const { petId, soapRecordId } = await params;

  return <PetVisitDetail petId={petId} soapRecordId={soapRecordId} backHref={`/doctor/patients/${petId}/visits`} />;
}
