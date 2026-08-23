"use client";

import { useState } from "react";

import { RescheduleForm } from "@/components/appointments/reschedule-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RescheduleDialog({
  appointmentId,
  doctorId,
  serviceId,
  visitType,
  currentStartsAt,
}: {
  appointmentId: string;
  doctorId: string;
  serviceId: string;
  visitType: string;
  currentStartsAt: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="touch" />}>Reschedule</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
        </DialogHeader>

        <RescheduleForm
          appointmentId={appointmentId}
          doctorId={doctorId}
          serviceId={serviceId}
          visitType={visitType}
          currentStartsAt={currentStartsAt}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
