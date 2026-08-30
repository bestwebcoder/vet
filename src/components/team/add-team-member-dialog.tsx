"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { AddTeamMemberForm } from "@/components/team/add-team-member-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { RoleOption } from "@/lib/validation/team";

export function AddTeamMemberDialog({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="touch" />}>
        <UserPlus aria-hidden />
        Add user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            The account works as soon as you save — no invitation to wait for. Set a first password and pass it on;
            their role decides what they can reach, and can be changed at any time.
          </DialogDescription>
        </DialogHeader>

        <AddTeamMemberForm roles={roles} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
