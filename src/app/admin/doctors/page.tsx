import type { Metadata } from "next";
import Link from "next/link";

import { DoctorList } from "@/components/doctors/doctor-list";
import { InviteDoctorDialog } from "@/components/doctors/invite-doctor-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { listBranches } from "@/features/clients/queries";
import { listDoctorsForAdmin } from "@/features/doctors/queries";
import { cn } from "@/lib/utils";
import { UserRound } from "lucide-react";

export const metadata: Metadata = { title: "Doctors · TV Care" };

export default async function AdminDoctorsPage({ searchParams }: PageProps<"/admin/doctors">) {
  await requireRole("admin", "super_admin");
  const { show } = await searchParams;
  const includeInactive = show === "all";

  const [doctorsResult, branches] = await Promise.all([listDoctorsForAdmin(includeInactive), listBranches()]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h1>Doctors</h1>
          <p className="text-muted-foreground">Every doctor at this practice, and who is currently able to sign in.</p>
        </div>
        <InviteDoctorDialog branches={branches} />
      </div>

      <div className="flex gap-2">
        <Link
          href="/admin/doctors"
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            !includeInactive ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
          )}
        >
          Active
        </Link>
        <Link
          href="/admin/doctors?show=all"
          className={cn(
            "rounded-full border px-3 py-1 text-xs",
            includeInactive ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground",
          )}
        >
          Include deactivated
        </Link>
      </div>

      {doctorsResult.status === "error" ? (
        <Card>
          <CardContent>
            <ErrorState title="Doctors could not be loaded" />
          </CardContent>
        </Card>
      ) : doctorsResult.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={UserRound}
              title="No doctors yet"
              description="Invite a doctor to get them access to appointments, patients and clinical records."
            />
          </CardContent>
        </Card>
      ) : (
        <DoctorList doctors={doctorsResult.data} branches={branches} />
      )}
    </div>
  );
}
