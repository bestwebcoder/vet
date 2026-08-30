import { PawPrint, Receipt, Stethoscope, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ReportAccessSettings } from "@/components/reports/report-access-settings";
import { Card, CardContent } from "@/components/ui/card";
import { requireAccess } from "@/features/auth/access";
import { hasRole } from "@/features/auth/session";
import { listDoctors } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Reports · TV Care" };

/**
 * `financeOnly` marks the one category a finance manager may open. The other
 * three read clinical and patient data they have no business seeing, and their
 * report functions reject them anyway (is_report_viewer, unchanged) — listing
 * them here would only offer a link that leads to a refusal.
 */
const CATEGORIES = [
  { href: "/admin/reports/financial", label: "Financial", description: "Revenue, outstanding and paid invoices, by service and doctor.", icon: Receipt, financeOnly: true },
  { href: "/admin/reports/clinical", label: "Clinical", description: "Consultations, vaccinations, deworming, follow-ups, emergencies, common diagnoses.", icon: Stethoscope },
  { href: "/admin/reports/clients", label: "Clients", description: "New, returning and active clients.", icon: Users },
  { href: "/admin/reports/patients", label: "Patients", description: "Species breakdown and most frequently visited patients.", icon: PawPrint },
];

export default async function AdminReportsPage() {
  const user = await requireAccess("finance");
  const isAdmin = hasRole(user, "admin", "super_admin");

  const categories = isAdmin ? CATEGORIES : CATEGORIES.filter((category) => category.financeOnly);

  // Granting a doctor report access is an administrator's decision, so the
  // control — and the doctor list behind it — is not fetched for anyone else.
  const doctorsResult = isAdmin ? await listDoctors() : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1>Reports</h1>
        <p className="text-muted-foreground">Every figure here is computed live from the database, with a date-range filter and CSV/PDF export.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {categories.map((category) => (
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

      {doctorsResult ? <ReportAccessSettings doctors={doctorsResult.status === "ok" ? doctorsResult.data : []} /> : null}
    </div>
  );
}
