import type { Metadata } from "next";

import { PetVisitDetail } from "@/components/soap/pet-visit-detail";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit · TV Care" };

export default async function AdminVisitDetailPage({
  params,
}: PageProps<"/admin/patients/[petId]/visits/[soapRecordId]">) {
  await requireRole("admin", "super_admin");
  const { petId, soapRecordId } = await params;

  return <PetVisitDetail petId={petId} soapRecordId={soapRecordId} backHref={`/admin/patients/${petId}/visits`} />;
}
