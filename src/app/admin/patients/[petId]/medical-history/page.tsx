import type { Metadata } from "next";

import { MedicalHistorySummary } from "@/components/soap/medical-history-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Medical history · TV Care" };

export default async function AdminMedicalHistoryPage({
  params,
}: PageProps<"/admin/patients/[petId]/medical-history">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <MedicalHistorySummary petId={petId} />;
}
