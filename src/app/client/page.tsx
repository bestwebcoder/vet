import { CalendarDays, PawPrint, Receipt, Syringe } from "lucide-react";

import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { firstName } from "@/lib/names";
import { getClientProfile } from "@/features/dashboard/queries";

export default async function ClientDashboardPage() {
  const user = await requireRole("client");
  const profile = await getClientProfile(user.id);

  return (
    <div className="grid gap-8">
      <DashboardHeader
        title={`Welcome, ${firstName(user.fullName)}`}
        subtitle="Your pets, appointments and records in one place."
      />

      <section className="grid gap-4">
        <h2 className="sr-only">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard
            label="My pets"
            metric={{ status: "pending", phase: 2 }}
            href="/client/pets"
            icon={PawPrint}
          />
          <AttentionCard
            label="Upcoming appointments"
            metric={{ status: "pending", phase: 3 }}
            href="/client/appointments"
            icon={CalendarDays}
          />
          <AttentionCard
            label="Vaccinations due"
            metric={{ status: "pending", phase: 6 }}
            href="/client/vaccinations"
            icon={Syringe}
          />
          <AttentionCard
            label="Unpaid invoices"
            metric={{ status: "pending", phase: 7 }}
            href="/client/invoices"
            icon={Receipt}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>
            Held by your clinic. Ask them to update anything that is wrong.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.status === "error" ? (
            <ErrorState
              title="Your details could not be loaded"
              description="Please try again in a moment. Your records are unaffected."
            />
          ) : profile.status === "missing" ? (
            <p className="text-muted-foreground text-sm">
              Your clinic has not finished setting up your record yet. Contact The Traveling Vet if
              this does not resolve.
            </p>
          ) : (
            <dl className="grid gap-3 text-sm">
              <Detail label="Name" value={profile.fullName} />
              <Detail label="Mobile" value={profile.phone} numeric />
              {profile.city ? <Detail label="City" value={profile.city} /> : null}
              {profile.organizationName ? (
                <Detail label="Clinic" value={profile.organizationName} />
              ) : null}
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-numeric={numeric ? "" : undefined} className="text-right">
        {value}
      </dd>
    </div>
  );
}
