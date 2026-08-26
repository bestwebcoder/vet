"use client";

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

/** Photo-forward preview of the practice's doctors. Each opens a popup with their full details instead of leaving the page — /doctors has the complete roster for anyone without a photo yet. */
export function TeamGallery({ doctors }: { doctors: PublicDoctor[] }) {
  const withPhoto = doctors.filter((doctor) => doctor.photoUrl).slice(0, 4);
  if (withPhoto.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-2xl font-semibold tracking-tight">Meet our team</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {withPhoto.map((doctor) => (
          <TeamMemberCard key={doctor.id} doctor={doctor} />
        ))}
      </div>
      <p className="mt-8 text-center">
        <Link href="/doctors" className="text-sm font-medium underline underline-offset-4">
          Meet the rest of our team
        </Link>
      </p>
    </section>
  );
}

function TeamMemberCard({ doctor }: { doctor: PublicDoctor }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="group focus-visible:ring-ring block w-full overflow-hidden rounded-2xl text-left focus-visible:ring-2 focus-visible:outline-none"
          />
        }
      >
        <div className="relative aspect-4/5 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here. */}
          <img
            src={doctor.photoUrl!}
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        </div>
        <p className="mt-3 font-medium">{doctor.fullName}</p>
        {doctor.specialization ? <p className="text-muted-foreground text-sm">{doctor.specialization}</p> : null}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here. */}
            <img
              src={doctor.photoUrl!}
              alt=""
              className="ring-primary/15 size-14 shrink-0 rounded-full object-cover ring-2"
            />
            <div className="grid gap-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                {doctor.fullName}
                {doctor.isLeadDoctor ? <Badge>Lead doctor</Badge> : null}
              </DialogTitle>
              {doctor.specialization ? <DialogDescription>{doctor.specialization}</DialogDescription> : null}
            </div>
          </div>
        </DialogHeader>

        {doctor.qualifications || doctor.bio ? (
          <div className="grid gap-2">
            {doctor.qualifications ? <p className="text-sm font-medium">{doctor.qualifications}</p> : null}
            {doctor.bio ? <p className="text-muted-foreground text-sm">{doctor.bio}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Link href="/doctors" className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}>
            View full team
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
