import type { Metadata } from "next";

import { MedicalHistorySummary } from "@/components/soap/medical-history-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Medical history · TV Care" };

export default async function ClientMedicalHistoryPage({
  params,
}: PageProps<"/client/pets/[petId]/medical-history">) {
  await requireRole("client");
  const { petId } = await params;

  return <MedicalHistorySummary petId={petId} />;
}
