import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { DoctorCard } from "@/components/marketing/doctor-card";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicDoctors } from "@/features/doctors/queries";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Doctors · TV Care" };

export default async function DoctorsPage() {
  const [organization, doctorsResult] = await Promise.all([getPublicOrganizationInfo(), getPublicDoctors()]);
  const practiceName = organization?.name ?? "The Traveling Vet";
  const doctors =
    doctorsResult.status === "ok"
      ? [...doctorsResult.data].sort((a, b) => Number(b.isLeadDoctor) - Number(a.isLeadDoctor))
      : [];

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Our doctors</h1>
          <p className="text-muted-foreground mt-6 text-lg text-balance">
            Every appointment at {practiceName} is with one of our veterinarians — choose the one you&rsquo;d
            like to see when you book.
          </p>
        </section>

        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            {doctorsResult.status === "error" ? (
              <ErrorState title="Doctors could not be loaded" />
            ) : doctors.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors listed yet"
                description="Check back soon — our veterinarians will appear here once they've joined the practice."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {doctors.map((doctor) => (
                  <DoctorCard key={doctor.id} doctor={doctor} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
