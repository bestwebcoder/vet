import type { Metadata } from "next";

import { PetVisitDetail } from "@/components/soap/pet-visit-detail";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Visit · TV Care" };

export default async function ClientVisitDetailPage({
  params,
}: PageProps<"/client/pets/[petId]/visits/[soapRecordId]">) {
  await requireRole("client");
  const { petId, soapRecordId } = await params;

  return <PetVisitDetail petId={petId} soapRecordId={soapRecordId} backHref={`/client/pets/${petId}/visits`} />;
}
