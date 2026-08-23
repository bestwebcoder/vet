"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { InviteDoctorForm } from "@/components/doctors/invite-doctor-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function InviteDoctorDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="touch" />}>
        <UserPlus aria-hidden />
        Invite doctor
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a doctor</DialogTitle>
          <DialogDescription>They receive an email to set their own password and sign in.</DialogDescription>
        </DialogHeader>

        <InviteDoctorForm branches={branches} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
