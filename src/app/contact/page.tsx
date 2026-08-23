import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";

import { ContactForm } from "@/components/marketing/contact-form";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Contact Us · TV Care" };

export default async function ContactPage() {
  const organization = await getPublicOrganizationInfo();
  const practiceName = organization?.name ?? "The Traveling Vet";

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Contact us</h1>
            <p className="text-muted-foreground mt-6 text-lg text-balance">
              Have a question before booking? Send us a message and we&rsquo;ll get back to you.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-4xl gap-8 lg:grid-cols-2">
            <Card>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {organization?.phone ? (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 size-5" aria-hidden />
                  <div>
                    <p className="font-medium">Phone</p>
                    <p className="text-muted-foreground text-sm">{organization.phone}</p>
                  </div>
                </div>
              ) : null}
              {organization?.email ? (
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 size-5" aria-hidden />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-muted-foreground text-sm">{organization.email}</p>
                  </div>
                </div>
              ) : null}
              {organization?.address || organization?.city ? (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-5" aria-hidden />
                  <div>
                    <p className="font-medium">Address</p>
                    <p className="text-muted-foreground text-sm">
                      {[organization.address, organization.city].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
