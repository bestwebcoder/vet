import Link from "next/link";
import {
  Bell,
  CalendarDays,
  FileText,
  Home,
  PawPrint,
  Receipt,
  ShieldCheck,
  Stethoscope,
  Syringe,
} from "lucide-react";

import { HeroCarousel } from "@/components/marketing/hero-carousel";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { TeamGallery } from "@/components/marketing/team-gallery";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicDoctor } from "@/features/doctors/queries";
import { MAX_HERO_IMAGES } from "@/features/organizations/hero-image-constants";
import type { PublicOrganizationInfo } from "@/features/organizations/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { cn } from "@/lib/utils";

const SERVICES = [
  {
    icon: Stethoscope,
    title: "Clinic visits",
    description: "Book a consultation at the practice with the doctor of your choice.",
  },
  {
    icon: Home,
    title: "Home visits",
    description: "Prefer your pet stay comfortable at home? We come to you.",
  },
  {
    icon: Syringe,
    title: "Vaccinations & deworming",
    description: "Every dose recorded, with the next one scheduled automatically.",
  },
  {
    icon: FileText,
    title: "Digital prescriptions",
    description: "Clear, dosed prescriptions you can find again whenever you need them.",
  },
];

const WHY = [
  {
    icon: PawPrint,
    title: "One record, always up to date",
    description: "Every visit, vaccination and prescription for your pet lives in one place, not a stack of paper.",
  },
  {
    icon: Bell,
    title: "Reminders that keep up",
    description: "Vaccination and deworming due dates are tracked for you, and a reminder goes out before they're due.",
  },
  {
    icon: Receipt,
    title: "Transparent billing",
    description: "Itemized invoices with clear totals, and a record of every payment against them.",
  },
  {
    icon: ShieldCheck,
    title: "Built for your privacy",
    description: "Role-based access means your pet's records are visible only to you and your care team.",
  },
];

const STEPS = [
  { step: "1", title: "Create an account", description: "Sign up and add your pet's basic details." },
  { step: "2", title: "Book an appointment", description: "Choose a doctor, a time, and clinic or home visit." },
  { step: "3", title: "Get the full picture", description: "SOAP notes, prescriptions and invoices, all in your account afterward." },
];

export function FrontPage({
  organization,
  leadDoctor,
  doctors,
  content,
  homeHref = null,
}: {
  organization: PublicOrganizationInfo | null;
  leadDoctor: PublicDoctor | null;
  doctors: PublicDoctor[];
  content: Record<string, string>;
  /** Set when the visitor is already signed in — swaps the sign-up/sign-in CTAs for a link back to their own dashboard. */
  homeHref?: string | null;
}) {
  const practiceName = organization?.name ?? "The Traveling Vet";
  const text = (key: string) => siteContentValue(content, key, practiceName);

  // The admin's own hero gallery (Settings) drives the slideshow. Until one
  // is uploaded, fall back to a handful of doctors with an admin-uploaded
  // photo, so a fresh install still looks intentional. Never a stock or
  // placeholder image standing in for a real person or place. Capped either
  // way: a practice with 30 doctors should not preload 30 full-size photos
  // into a hero slideshow nobody is going to sit through.
  const heroImages =
    organization && organization.heroImages.length > 0
      ? organization.heroImages
      : doctors
          .filter((doctor) => doctor.photoUrl)
          .slice(0, MAX_HERO_IMAGES)
          .map((doctor) => ({ src: doctor.photoUrl!, alt: "" }));

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-primary/15 pointer-events-none absolute top-[-12rem] left-1/2 size-[36rem] -translate-x-1/2 rounded-full blur-3xl"
          />
          <div
            aria-hidden
            className="bg-chart-2/10 pointer-events-none absolute -right-24 bottom-[-8rem] size-[28rem] rounded-full blur-3xl"
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div
              className={cn(
                "mx-auto grid items-center gap-10",
                heroImages.length > 0 ? "max-w-5xl lg:grid-cols-2 lg:text-left" : "max-w-2xl text-center",
              )}
            >
              <div className={cn("grid gap-6", heroImages.length > 0 ? "text-center lg:text-left" : "text-center")}>
                <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  {text("home.hero_title")}
                </h1>
                <p className="text-muted-foreground text-lg text-balance">{text("home.hero_subtitle")}</p>
                <div
                  className={cn(
                    "mt-2 flex flex-col gap-3 sm:flex-row",
                    heroImages.length > 0 ? "justify-center lg:justify-start" : "justify-center",
                  )}
                >
                  {homeHref ? (
                    <Link href={homeHref} className={cn(buttonVariants({ size: "touch" }), "w-full sm:w-auto")}>
                      Go to dashboard
                    </Link>
                  ) : (
                    <>
                      <Link href="/register" className={cn(buttonVariants({ size: "touch" }), "w-full sm:w-auto")}>
                        Create an account
                      </Link>
                      <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}>
                        Sign in
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {heroImages.length > 0 ? <HeroCarousel images={heroImages} /> : null}
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight">What we offer</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="grid gap-3">
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
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

        {/* Meet our lead doctor — only renders once an admin has marked one */}
        {leadDoctor ? (
          <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
            <div className="bg-card ring-foreground/10 flex flex-col items-center gap-6 rounded-2xl p-8 text-center ring-1 sm:flex-row sm:p-10 sm:text-left">
              {leadDoctor.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded, arbitrary-dimension public image; no build-time optimization to gain here.
                <img
                  src={leadDoctor.photoUrl}
                  alt=""
                  className="ring-primary/15 size-28 shrink-0 rounded-full object-cover ring-4"
                />
              ) : (
                <span className="bg-primary/10 text-primary ring-primary/15 flex size-28 shrink-0 items-center justify-center rounded-full ring-4">
                  <Stethoscope className="size-10" aria-hidden />
                </span>
              )}
              <div className="grid gap-2">
                <p className="text-muted-foreground text-sm font-medium tracking-wide uppercase">Meet our lead doctor</p>
                <h2 className="text-2xl font-semibold tracking-tight">{leadDoctor.fullName}</h2>
                {leadDoctor.specialization ? <p className="text-muted-foreground">{leadDoctor.specialization}</p> : null}
                {leadDoctor.qualifications ? <p className="text-muted-foreground text-sm">{leadDoctor.qualifications}</p> : null}
                {leadDoctor.bio ? <p className="text-muted-foreground mt-1 text-sm">{leadDoctor.bio}</p> : null}
                <Link href="/doctors" className="text-sm font-medium underline underline-offset-4">
                  Meet the rest of our team
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <TeamGallery doctors={doctors} />

        {/* Why TV Care */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Why pet owners choose TV Care</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {WHY.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="grid gap-1">
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-sm">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {STEPS.map(({ step, title, description }) => (
                <div key={step} className="grid gap-2 text-center sm:text-left">
                  <span className="bg-primary text-primary-foreground mx-auto flex size-9 items-center justify-center rounded-full text-sm font-semibold sm:mx-0">
                    {step}
                  </span>
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-sm">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <div className="bg-primary/8 mx-auto grid max-w-xl gap-4 rounded-3xl px-6 py-12 text-center sm:px-10">
            <span className="bg-primary text-primary-foreground mx-auto flex size-14 items-center justify-center rounded-full">
              <CalendarDays className="size-6" aria-hidden />
            </span>
            <h2 className="text-2xl font-semibold tracking-tight">{text("home.cta_title")}</h2>
            <p className="text-muted-foreground">{text("home.cta_subtitle")}</p>
            <Link
              href={homeHref ?? "/register"}
              className={cn(buttonVariants({ size: "touch" }), "mx-auto w-full sm:w-auto")}
            >
              {homeHref ? "Go to dashboard" : "Create an account"}
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
