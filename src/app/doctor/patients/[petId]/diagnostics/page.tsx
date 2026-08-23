import type { Metadata } from "next";

import { PetDiagnosticsSummary } from "@/components/soap/pet-diagnostics-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Diagnostics · TV Care" };

export default async function DoctorDiagnosticsPage({ params }: PageProps<"/doctor/patients/[petId]/diagnostics">) {
  await requireRole("doctor");
  const { petId } = await params;

  return <PetDiagnosticsSummary petId={petId} />;
}
