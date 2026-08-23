import {
  Building2,
  CalendarCheck,
  CalendarDays,
  PawPrint,
  Receipt,
  Scissors,
  Stethoscope,
  Syringe,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Worm,
} from "lucide-react";

import { ActivityList } from "@/components/dashboard/activity-list";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { countAppointments } from "@/features/appointments/queries";
import { getAdminOperationalSummary, getAdminOverview, getAdminRevenue, getRecentActivity, type Metric } from "@/features/dashboard/queries";
import { requireRole } from "@/features/auth/session";
import { listPracticeDewormingStatuses } from "@/features/deworming/queries";
import { listPracticeVaccinationStatuses } from "@/features/vaccinations/queries";
import { formatCurrency } from "@/lib/currency";
import { getDueInfo } from "@/lib/due-window";

export default async function AdminDashboardPage() {
  const user = await requireRole("admin", "super_admin");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [overview, activity, appointmentsToday, vaccinationStatuses, dewormingStatuses, revenue, operational] = await Promise.all([
    getAdminOverview(),
    getRecentActivity(),
    countAppointments({
      from: startOfToday.toISOString(),
      to: startOfTomorrow.toISOString(),
      excludeStatuses: ["cancelled", "no_show"],
    }),
    listPracticeVaccinationStatuses(),
    listPracticeDewormingStatuses(),
    getAdminRevenue(),
    getAdminOperationalSummary(),
  ]);

  const vaccinationsDueToday: Metric =
    vaccinationStatuses.status === "ok"
      ? {
          status: "ok",
          value: vaccinationStatuses.data.filter((row) => ["due_today", "overdue"].includes(getDueInfo(row.nextDueDate).status))
            .length,
        }
      : { status: "error" };

  const dewormingDueThisWeek: Metric =
    dewormingStatuses.status === "ok"
      ? {
          status: "ok",
          value: dewormingStatuses.data.filter((row) =>
            ["due_in_7", "due_today", "overdue"].includes(getDueInfo(row.nextDueDate).status),
          ).length,
        }
      : { status: "error" };

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
            metric={appointmentsToday}
            href="/admin/appointments"
            icon={CalendarDays}
          />
          <AttentionCard
            label="Unpaid invoices"
            metric={revenue.unpaidInvoices}
            href="/admin/billing"
            icon={Receipt}
          />
          <AttentionCard
            label="Today's revenue"
            metric={revenue.todayRevenuePaisa}
            href="/admin/payments"
            icon={Wallet}
            formatValue={(value) => formatCurrency(value)}
          />
          <AttentionCard
            label="This month's revenue"
            metric={revenue.monthRevenuePaisa}
            href="/admin/payments"
            icon={Wallet}
            formatValue={(value) => formatCurrency(value)}
          />
          <AttentionCard
            label="Outstanding balance"
            metric={revenue.outstandingBalancePaisa}
            href="/admin/billing"
            icon={Receipt}
            formatValue={(value) => formatCurrency(value)}
          />
          <AttentionCard
            label="Vaccinations due today"
            metric={vaccinationsDueToday}
            href="/admin/vaccinations"
            icon={Syringe}
          />
          <AttentionCard
            label="Deworming due this week"
            metric={dewormingDueThisWeek}
            href="/admin/deworming"
            icon={Worm}
          />
          <AttentionCard
            label="Registered clients"
            metric={overview.clients}
            href="/admin/clients"
            icon={Users}
          />
          <AttentionCard
            label="New clients"
            metric={operational.newClients}
            href="/admin/clients"
            icon={UserPlus}
            description="Last 7 days"
          />
          <AttentionCard
            label="New patients"
            metric={operational.newPatients}
            href="/admin/patients"
            icon={PawPrint}
            description="Last 7 days"
          />
          <AttentionCard
            label="Upcoming surgeries"
            metric={operational.upcomingSurgeries}
            href="/admin/appointments"
            icon={Scissors}
          />
          <AttentionCard
            label="Doctors on duty today"
            metric={operational.doctorsOnDutyToday}
            href="/admin/appointments/availability"
            icon={CalendarCheck}
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
