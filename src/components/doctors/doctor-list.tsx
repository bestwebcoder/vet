"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import { DoctorEditForm } from "@/components/doctors/doctor-edit-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deactivateDoctorAction, reactivateDoctorAction } from "@/features/doctors/actions";
import type { DoctorSummary } from "@/features/doctors/queries";
import { idleState } from "@/lib/forms";

function DeactivateToggle({ doctor }: { doctor: DoctorSummary }) {
  const action = doctor.isActive ? deactivateDoctorAction : reactivateDoctorAction;
  const [, formAction] = useActionState(action, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="doctorId" value={doctor.id} />
      <input type="hidden" name="userId" value={doctor.userId} />
      <Button type="submit" variant="outline" size="sm">
        {doctor.isActive ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

function EditDoctorDialog({ doctor, branches }: { doctor: DoctorSummary; branches: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil aria-hidden />
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {doctor.fullName}</DialogTitle>
        </DialogHeader>
        <DoctorEditForm doctor={doctor} branches={branches} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function DoctorList({
  doctors,
  branches,
}: {
  doctors: DoctorSummary[];
  branches: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-3">
      {doctors.map((doctor) => (
        <Card key={doctor.id} className={!doctor.isActive ? "opacity-70" : undefined}>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{doctor.fullName}</p>
                <p className="text-muted-foreground text-sm">
                  {doctor.email}
                  {doctor.phone ? ` · ${doctor.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!doctor.isActive ? <Badge variant="destructive">Deactivated</Badge> : null}
                {!doctor.isAcceptingAppointments ? <Badge variant="outline">Not accepting appointments</Badge> : null}
                {doctor.canManageBilling ? <Badge variant="secondary">Billing</Badge> : null}
                {doctor.canViewReports ? <Badge variant="secondary">Reports</Badge> : null}
              </div>
            </div>

            <div className="text-muted-foreground grid gap-1 text-sm">
              {doctor.specialization ? <p>{doctor.specialization}</p> : null}
              {doctor.registrationNumber ? <p>Reg. no. {doctor.registrationNumber}</p> : null}
              {doctor.qualifications ? <p>{doctor.qualifications}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <EditDoctorDialog doctor={doctor} branches={branches} />
              <DeactivateToggle doctor={doctor} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
