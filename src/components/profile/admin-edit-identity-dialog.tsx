"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { AdminIdentityForm } from "@/components/profile/admin-identity-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** An admin corrects someone's name or phone number — used where there is no existing "edit this person" dialog to embed the form into. */
export function AdminEditIdentityDialog({
  targetUserId,
  fullName,
  phone,
}: {
  targetUserId: string;
  fullName: string;
  phone: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Pencil aria-hidden />
        Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {fullName}</DialogTitle>
        </DialogHeader>
        <AdminIdentityForm
          targetUserId={targetUserId}
          fullName={fullName}
          phone={phone}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
