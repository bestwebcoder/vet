import type { Metadata } from "next";
import { HeartHandshake, MapPin, Stethoscope } from "lucide-react";

import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "About Us · TV Care" };

const VALUES = [
  {
    icon: Stethoscope,
    title: "Veterinarian-led care",
    description: "Every diagnosis, prescription and treatment plan is made by the attending veterinarian — never automated.",
  },
  {
    icon: MapPin,
    title: "Wherever your pet is comfortable",
    description: "A consultation at the practice, or a visit at home — the same doctors, the same standard of care.",
  },
  {
    icon: HeartHandshake,
    title: "A record that stays with you",
    description: "Every visit, vaccination and prescription is kept in one place, so nothing is lost between appointments.",
  },
];

export default async function AboutPage() {
  const organization = await getPublicOrganizationInfo();
  const practiceName = organization?.name ?? "The Traveling Vet";

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">About {practiceName}</h1>
          <p className="text-muted-foreground mt-6 text-lg text-balance">
            {practiceName} is a veterinary practice built around the appointment, not the paperwork —
            clinic consultations and home visits from real doctors, with every record kept in one place
            for the life of your pet.
          </p>
        </section>

        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-3">
              {VALUES.map(({ icon: Icon, title, description }) => (
                <Card key={title}>
                  <CardContent className="grid gap-3">
                    <span className="bg-secondary text-secondary-foreground flex size-10 items-center justify-center rounded-full">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground text-sm">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How we work</h2>
          <div className="text-muted-foreground mt-4 grid gap-4">
            <p>
              Booking is simple: choose a doctor, a time, and whether you&rsquo;d rather come to the clinic or
              have the doctor come to you. From there, everything about that visit — the assessment, any
              prescription, vaccinations given, and the invoice — is recorded against your pet&rsquo;s own account,
              so you and your care team can always see the full picture.
            </p>
            <p>
              We track vaccination and deworming schedules for you and send a reminder before the next one is
              due, so nothing falls through between visits.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
