import { Lock, PawPrint, Receipt, Stethoscope, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Reports · TV Care" };

const CATEGORIES = [
  { href: "/doctor/reports/financial", label: "Financial", description: "Revenue, outstanding and paid invoices, by service and doctor.", icon: Receipt },
  { href: "/doctor/reports/clinical", label: "Clinical", description: "Consultations, vaccinations, deworming, follow-ups, emergencies, common diagnoses.", icon: Stethoscope },
  { href: "/doctor/reports/clients", label: "Clients", description: "New, returning and active clients.", icon: Users },
  { href: "/doctor/reports/patients", label: "Patients", description: "Species breakdown and most frequently visited patients.", icon: PawPrint },
];

export default async function DoctorReportsPage() {
  await requireRole("doctor");
  const doctor = await getOwnDoctorRecord();
  const canViewReports = doctor.status === "ok" && doctor.data?.canViewReports === true;

  if (!canViewReports) {
    return (
      <div className="grid gap-6">
        <h1>Reports</h1>
        <Card>
          <CardContent>
            <EmptyState
              icon={Lock}
              title="You do not have report access"
              description="Ask an administrator to grant you report access from Admin → Reports."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground">Every figure here is computed live from the database, with a date-range filter and CSV/PDF export.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <Link key={category.href} href={category.href} className="block">
            <Card className="hover:border-ring focus-within:border-ring transition-colors">
              <CardContent className="flex items-start gap-4">
                <span className="bg-secondary text-secondary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <category.icon className="size-5" aria-hidden />
                </span>
                <div className="grid gap-0.5">
                  <span className="font-medium">{category.label}</span>
                  <span className="text-muted-foreground text-sm">{category.description}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
