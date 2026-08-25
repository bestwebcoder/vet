import Link from "next/link";

import type { PublicDoctor } from "@/features/doctors/queries";

/** Photo-forward preview of the practice's doctors, linking to the full roster at /doctors. Only real, admin-uploaded photos — never a placeholder face. */
export function TeamGallery({ doctors }: { doctors: PublicDoctor[] }) {
  const withPhoto = doctors.filter((doctor) => doctor.photoUrl).slice(0, 4);
  if (withPhoto.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center text-2xl font-semibold tracking-tight">Meet our team</h2>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {withPhoto.map((doctor) => (
          <Link
            key={doctor.id}
            href="/doctors"
            className="group focus-visible:ring-ring block overflow-hidden rounded-2xl focus-visible:ring-2 focus-visible:outline-none"
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
          </Link>
        ))}
      </div>
    </section>
  );
}
