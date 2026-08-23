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

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicOrganizationInfo } from "@/features/organizations/queries";
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

export function FrontPage({ organization }: { organization: PublicOrganizationInfo | null }) {
  const practiceName = organization?.name ?? "The Traveling Vet";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-border/60 border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-lg font-semibold tracking-tight">TV Care</p>
            <p className="text-muted-foreground text-xs">{practiceName}</p>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/login" className={buttonVariants({ variant: "ghost", size: "touch" })}>
              Sign in
            </Link>
            <Link href="/register" className={buttonVariants({ size: "touch" })}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-2xl gap-6 text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Veterinary care for your pet, organized in one place
            </h1>
            <p className="text-muted-foreground text-lg text-balance">
              Book appointments, keep track of vaccinations, and see your pet&rsquo;s full medical history —
              all from one account with {practiceName}.
            </p>
            <div className="mt-2 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/register" className={cn(buttonVariants({ size: "touch" }), "w-full sm:w-auto")}>
                Create an account
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "touch" }), "w-full sm:w-auto")}>
                Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight">What we offer</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map(({ icon: Icon, title, description }) => (
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

        {/* Why TV Care */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">Why pet owners choose TV Care</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {WHY.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-4">
                <span className="bg-secondary text-secondary-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
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
                  <span className="text-primary mx-auto flex size-9 items-center justify-center rounded-full border border-current text-sm font-semibold sm:mx-0">
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
        <section className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6">
          <div className="mx-auto grid max-w-xl gap-4">
            <CalendarDays className="mx-auto size-8" aria-hidden />
            <h2 className="text-2xl font-semibold tracking-tight">Ready to book your pet&rsquo;s next visit?</h2>
            <p className="text-muted-foreground">Create an account in a couple of minutes — no paperwork required.</p>
            <Link href="/register" className={cn(buttonVariants({ size: "touch" }), "mx-auto w-full sm:w-auto")}>
              Create an account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-border/60 border-t">
        <div className="text-muted-foreground mx-auto grid w-full max-w-6xl gap-1 px-4 py-8 text-sm sm:px-6">
          <p className="text-foreground font-medium">{practiceName}</p>
          {organization?.address || organization?.city ? (
            <p>{[organization.address, organization.city].filter(Boolean).join(", ")}</p>
          ) : null}
          <p className="flex flex-wrap gap-x-4">
            {organization?.phone ? <span>{organization.phone}</span> : null}
            {organization?.email ? <span>{organization.email}</span> : null}
          </p>
          <p className="mt-4">© {new Date().getFullYear()} TV Care.</p>
        </div>
      </footer>
    </div>
  );
}
