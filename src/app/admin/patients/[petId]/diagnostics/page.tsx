import type { Metadata } from "next";

import { PetDiagnosticsSummary } from "@/components/soap/pet-diagnostics-summary";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Diagnostics · TV Care" };

export default async function AdminDiagnosticsPage({ params }: PageProps<"/admin/patients/[petId]/diagnostics">) {
  await requireRole("admin", "super_admin");
  const { petId } = await params;

  return <PetDiagnosticsSummary petId={petId} />;
}
