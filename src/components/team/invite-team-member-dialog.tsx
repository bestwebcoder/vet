"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { InviteTeamMemberForm } from "@/components/team/invite-team-member-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function InviteTeamMemberDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="touch" />}>
        <UserPlus aria-hidden />
        Add team member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>They receive an email to set their own password and sign in.</DialogDescription>
        </DialogHeader>

        <InviteTeamMemberForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
