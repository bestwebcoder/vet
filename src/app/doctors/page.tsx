import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicDoctors } from "@/features/doctors/queries";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Doctors · TV Care" };

export default async function DoctorsPage() {
  const [organization, doctorsResult] = await Promise.all([getPublicOrganizationInfo(), getPublicDoctors()]);
  const practiceName = organization?.name ?? "The Traveling Vet";

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} />

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
            ) : doctorsResult.data.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors listed yet"
                description="Check back soon — our veterinarians will appear here once they've joined the practice."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {doctorsResult.data.map((doctor) => (
                  <Card key={doctor.id}>
                    <CardContent className="grid gap-2">
                      <span className="bg-secondary text-secondary-foreground flex size-11 items-center justify-center rounded-full">
                        <Stethoscope className="size-5" aria-hidden />
                      </span>
                      <p className="font-medium">{doctor.fullName}</p>
                      {doctor.specialization ? (
                        <p className="text-muted-foreground text-sm">{doctor.specialization}</p>
                      ) : null}
                      {doctor.qualifications ? (
                        <p className="text-muted-foreground text-sm">{doctor.qualifications}</p>
                      ) : null}
                      {doctor.bio ? <p className="text-muted-foreground mt-1 text-sm">{doctor.bio}</p> : null}
                    </CardContent>
                  </Card>
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
