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
        Add user
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            They receive an email to set their own password. Their role decides what they can reach once they sign
            in, and can be changed at any time.
          </DialogDescription>
        </DialogHeader>

        <InviteTeamMemberForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
