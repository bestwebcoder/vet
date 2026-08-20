import { Building2, CalendarDays, Receipt, Stethoscope, Syringe, UserCog, Users } from "lucide-react";

import { ActivityList } from "@/components/dashboard/activity-list";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { getAdminOverview, getRecentActivity } from "@/features/dashboard/queries";
import { requireRole } from "@/features/auth/session";

export default async function AdminDashboardPage() {
  const user = await requireRole("admin", "super_admin");
  const [overview, activity] = await Promise.all([getAdminOverview(), getRecentActivity()]);

  return (
    <div className="grid gap-8">
      <DashboardHeader
        title="Practice overview"
        subtitle={`Signed in as ${user.fullName}. Everything for The Traveling Vet.`}
      />

      <section className="grid gap-4">
        <h2 className="sr-only">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard
            label="Appointments today"
            metric={{ status: "pending", phase: 3 }}
            href="/admin/appointments"
            icon={CalendarDays}
          />
          <AttentionCard
            label="Unpaid invoices"
            metric={{ status: "pending", phase: 7 }}
            href="/admin/billing"
            icon={Receipt}
          />
          <AttentionCard
            label="Vaccinations due"
            metric={{ status: "pending", phase: 6 }}
            href="/admin/vaccinations"
            icon={Syringe}
          />
          <AttentionCard
            label="Registered clients"
            metric={overview.clients}
            href="/admin/clients"
            icon={Users}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-base font-medium">Practice</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AttentionCard
            label="Doctors"
            metric={overview.doctors}
            href="/admin/doctors"
            icon={Stethoscope}
            actionLabel="Manage"
          />
          <AttentionCard
            label="Staff"
            metric={overview.staff}
            href="/admin/settings"
            icon={UserCog}
            actionLabel="Manage"
          />
          <AttentionCard
            label="Branches"
            metric={overview.branches}
            href="/admin/settings"
            icon={Building2}
            actionLabel="Manage"
          />
        </div>
      </section>

      <ActivityList activity={activity} />
    </div>
  );
}
