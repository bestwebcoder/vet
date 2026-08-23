"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleReportsPermissionAction } from "@/features/doctors/billing-actions";
import type { DoctorSummary } from "@/features/doctors/queries";
import { idleState } from "@/lib/forms";

function ToggleReportsAccessButton({ doctor }: { doctor: DoctorSummary }) {
  const [, formAction] = useActionState(toggleReportsPermissionAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="doctorId" value={doctor.id} />
      <input type="hidden" name="canViewReports" value={String(doctor.canViewReports)} />
      <Button type="submit" variant="outline" size="sm">
        {doctor.canViewReports ? "Remove report access" : "Grant report access"}
      </Button>
    </form>
  );
}

/** §8.6 — a doctor sees nothing here by default; this is the only way to change that. */
export function ReportAccessSettings({ doctors }: { doctors: DoctorSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Doctor report access</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Reports are admin-only by default. A doctor without this cannot see practice-wide financial or clinical
          figures, even though they can already open an individual patient&rsquo;s own record.
        </p>
        {doctors.length === 0 ? (
          <p className="text-muted-foreground text-sm">No doctors yet.</p>
        ) : (
          <ul className="grid gap-2">
            {doctors.map((doctor) => (
              <li key={doctor.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="flex items-center gap-2">
                  {doctor.fullName}
                  {doctor.canViewReports ? <Badge variant="secondary">Can view reports</Badge> : null}
                </span>
                <ToggleReportsAccessButton doctor={doctor} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
