"use client";

import { Stethoscope } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PublicDoctor } from "@/features/doctors/queries";
import { cn } from "@/lib/utils";

/**
 * A doctor's public-facing tile — photo, name and specialization, clicking
 * (or Enter/Space, since it's a real button) opens their full profile in a
 * popup: photo, name, branch, qualifications and bio. Shared by the home
 * page's team preview and the full /doctors roster so both behave the same
 * way instead of drifting apart.
 */
export function DoctorCard({
  doctor,
  showViewFullTeamLink = false,
}: {
  doctor: PublicDoctor;
  /** Only makes sense linking away from this list to the full roster — omit on /doctors itself. */
  showViewFullTeamLink?: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group focus-visible:ring-ring block h-full w-full cursor-pointer overflow-hidden rounded-2xl text-left focus-visible:ring-2 focus-visible:outline-none"
          />
        }
      >
        <div className="relative aspect-4/5 overflow-hidden rounded-2xl">
          {doctor.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here.
            <img
              src={doctor.photoUrl}
              alt=""
              className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <span className="bg-secondary text-secondary-foreground flex size-full items-center justify-center">
              <Stethoscope className="size-8" aria-hidden />
            </span>
          )}
        </div>
        <p className="mt-3 font-medium group-hover:underline">{doctor.fullName}</p>
        {doctor.specialization ? <p className="text-muted-foreground text-sm">{doctor.specialization}</p> : null}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {doctor.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here.
              <img
                src={doctor.photoUrl}
                alt=""
                className="ring-primary/15 size-14 shrink-0 rounded-full object-cover ring-2"
              />
            ) : (
              <span className="bg-secondary text-secondary-foreground ring-primary/15 flex size-14 shrink-0 items-center justify-center rounded-full ring-2">
                <Stethoscope className="size-6" aria-hidden />
              </span>
            )}
            <div className="grid gap-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                {doctor.fullName}
                {doctor.isLeadDoctor ? <Badge>Lead doctor</Badge> : null}
              </DialogTitle>
              {doctor.specialization ? <DialogDescription>{doctor.specialization}</DialogDescription> : null}
            </div>
          </div>
        </DialogHeader>

        {doctor.branchName || doctor.qualifications || doctor.bio ? (
          <div className="grid gap-2 text-sm">
            {doctor.branchName ? (
              <p className="text-muted-foreground">
                <span className="text-foreground font-medium">Branch:</span> {doctor.branchName}
              </p>
            ) : null}
            {doctor.qualifications ? <p className="font-medium">{doctor.qualifications}</p> : null}
            {doctor.bio ? <p className="text-muted-foreground">{doctor.bio}</p> : null}
          </div>
        ) : null}

        {showViewFullTeamLink ? (
          <DialogFooter>
            <Link href="/doctors" className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}>
              View full team
            </Link>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
