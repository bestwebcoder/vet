"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { DoctorCard } from "@/components/marketing/doctor-card";
import { Button } from "@/components/ui/button";
import type { PublicDoctor } from "@/features/doctors/queries";

const PAGE_SIZE = 4;

/** Pages through `doctors` four at a time — one row, Previous/Next below it, rather than a horizontal-scroll carousel. */
export function TeamPager({ doctors }: { doctors: PublicDoctor[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(doctors.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const visible = doctors.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-10 grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((doctor) => (
          <DoctorCard key={doctor.id} doctor={doctor} showViewFullTeamLink />
        ))}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
            aria-label="Show previous team members"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            disabled={page === pageCount - 1}
            onClick={() => setPage((current) => current + 1)}
            aria-label="Show more team members"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
