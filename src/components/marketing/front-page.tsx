import Link from "next/link";
import { CalendarDays, Stethoscope } from "lucide-react";

import { HeroCarousel } from "@/components/marketing/hero-carousel";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { TeamGallery } from "@/components/marketing/team-gallery";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicDoctor } from "@/features/doctors/queries";
import type { HomeSectionItemsBySection } from "@/features/home-sections/queries";
import { MAX_HERO_IMAGES } from "@/features/organizations/hero-image-constants";
import type { PublicOrganizationInfo } from "@/features/organizations/queries";
import { siteContentValue } from "@/features/site-content/fields";
import { iconByKey } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function FrontPage({
  organization,
  leadDoctor,
  doctors,
  content,
  homeSections,
  homeHref = null,
}: {
  organization: PublicOrganizationInfo | null;
  leadDoctor: PublicDoctor | null;
  doctors: PublicDoctor[];
  content: Record<string, string>;
  /** "What we offer" / "Why pet owners choose" / "How it works" — admin-editable via /admin/website/home-sections. */
  homeSections: HomeSectionItemsBySection;
  /**
   * Set when the visitor is already signed in. The header keeps its own
   * single "Go to dashboard" button (PublicHeader); everywhere else on this
   * page the Create an account / Sign in buttons keep their normal labels,
   * but point here instead of /register or /login — a signed-in visitor
   * clicking either just lands on their own area rather than a sign-up or
   * sign-in form that no longer applies to them.
   */
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
          .map((doctor) => ({ src: doctor.photoUrl!, alt: "", caption: null }));

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} organizationId={organization?.id ?? null} />

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
                  <Link
                    href={homeHref ?? "/register"}
                    className={cn(buttonVariants({ size: "touch" }), "w-full sm:w-auto")}
                  >
                    Create an account
                  </Link>
                  <Link
                    href={homeHref ?? "/login"}
                    className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}
                  >
                    Sign in
                  </Link>
                </div>
              </div>

              {heroImages.length > 0 ? <HeroCarousel images={heroImages} /> : null}
            </div>
          </div>
        </section>

        {/* Services */}
        {homeSections.services.length > 0 ? (
          <section className="border-border/60 border-t bg-muted/40">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
              <h2 className="text-center text-2xl font-semibold tracking-tight">What we offer</h2>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {homeSections.services.map((item) => {
                  const Icon = iconByKey(item.icon);
                  return (
                    <Card key={item.id} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <CardContent className="grid gap-3">
                        {Icon ? (
                          <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
                            <Icon className="size-5" aria-hidden />
                          </span>
                        ) : null}
                        <p className="font-medium">{item.title}</p>
                        <p className="text-muted-foreground text-sm">{item.description}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

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
        {homeSections.why.length > 0 ? (
          <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight">Why pet owners choose TV Care</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {homeSections.why.map((item) => {
                const Icon = iconByKey(item.icon);
                return (
                  <div key={item.id} className="flex gap-4">
                    {Icon ? (
                      <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                        <Icon className="size-5" aria-hidden />
                      </span>
                    ) : null}
                    <div className="grid gap-1">
                      <p className="font-medium">{item.title}</p>
                      <p className="text-muted-foreground text-sm">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* How it works */}
        {homeSections.how_it_works.length > 0 ? (
          <section className="border-border/60 border-t bg-muted/40">
            <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
              <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
              <div className="mt-10 grid gap-6 sm:grid-cols-3">
                {homeSections.how_it_works.map((item, index) => (
                  <div key={item.id} className="grid gap-2 text-center sm:text-left">
                    <span className="bg-primary text-primary-foreground mx-auto flex size-9 items-center justify-center rounded-full text-sm font-semibold sm:mx-0">
                      {index + 1}
                    </span>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-sm">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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
              Create an account
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
