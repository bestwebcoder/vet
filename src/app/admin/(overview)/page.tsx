import {
  Building2,
  CalendarCheck,
  CalendarDays,
  FlaskConical,
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
import { ACCESS } from "@/features/auth/access";
import { hasRole, requireRole } from "@/features/auth/session";
import { listPracticeDewormingStatuses } from "@/features/deworming/queries";
import { listOpenDiagnosticsQueue } from "@/features/soap/queries";
import { listPracticeVaccinationStatuses } from "@/features/vaccinations/queries";
import { formatCurrency } from "@/lib/currency";
import { getDueInfo } from "@/lib/due-window";

/**
 * The practice overview — and, for the narrower clinic-side roles, only the
 * part of it they can actually see.
 *
 * This matters more than it looks. A denied read under row level security
 * comes back as an empty set, not an error, so a finance manager rendering the
 * full dashboard would be told "0 patients" and "0 vaccinations due today" —
 * numbers that are wrong rather than absent, about records they are not
 * allowed to count. Each block is gated on the same role that gates the page
 * it links to, and the queries behind a hidden block are never run.
 */
export default async function AdminDashboardPage() {
  const user = await requireRole(...ACCESS.shared);

  const organizationId = user.organizationIds[0];
  const isAdmin = hasRole(user, "admin", "super_admin");
  const seesMoney = isAdmin || hasRole(user, "finance_manager");
  const seesFrontDesk = isAdmin || hasRole(user, "receptionist");
  const seesLab = isAdmin || hasRole(user, "lab");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [overview, activity, appointmentsToday, vaccinationStatuses, dewormingStatuses, revenue, operational, openDiagnostics] = await Promise.all([
    isAdmin ? getAdminOverview() : null,
    isAdmin && organizationId ? getRecentActivity(organizationId) : null,
    seesFrontDesk
      ? countAppointments({
          from: startOfToday.toISOString(),
          to: startOfTomorrow.toISOString(),
          excludeStatuses: ["cancelled", "no_show"],
        })
      : null,
    seesFrontDesk ? listPracticeVaccinationStatuses() : null,
    seesFrontDesk ? listPracticeDewormingStatuses() : null,
    seesMoney ? getAdminRevenue() : null,
    isAdmin ? getAdminOperationalSummary() : null,
    seesLab ? listOpenDiagnosticsQueue() : null,
  ]);

  // The lab's own "what needs my attention today": tests a doctor has ordered
  // and nobody has resulted yet.
  const openTests: Metric =
    openDiagnostics?.status === "ok" ? { status: "ok", value: openDiagnostics.data.length } : { status: "error" };

  const vaccinationsDueToday: Metric =
    vaccinationStatuses?.status === "ok"
      ? {
          status: "ok",
          value: vaccinationStatuses.data.filter((row) => ["due_today", "overdue"].includes(getDueInfo(row.nextDueDate).status))
            .length,
        }
      : { status: "error" };

  const dewormingDueThisWeek: Metric =
    dewormingStatuses?.status === "ok"
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
        title={isAdmin ? "Practice overview" : "Your day"}
        subtitle={
          isAdmin
            ? `Signed in as ${user.fullName}. Everything across the practice.`
            : `Signed in as ${user.fullName}. What needs your attention today.`
        }
      />

      <section className="grid gap-4">
        <h2 className="sr-only">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {seesFrontDesk && appointmentsToday ? (
            <AttentionCard
              label="Appointments today"
              metric={appointmentsToday}
              href="/admin/appointments"
              icon={CalendarDays}
            />
          ) : null}

          {seesMoney && revenue ? (
            <>
              <AttentionCard label="Unpaid invoices" metric={revenue.unpaidInvoices} href="/admin/billing" icon={Receipt} />
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
            </>
          ) : null}

          {seesFrontDesk ? (
            <>
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
            </>
          ) : null}

          {seesLab ? (
            <AttentionCard label="Tests awaiting a result" metric={openTests} href="/admin/lab" icon={FlaskConical} />
          ) : null}

          {isAdmin && overview && operational ? (
            <>
              <AttentionCard label="Registered clients" metric={overview.clients} href="/admin/clients" icon={Users} />
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
            </>
          ) : null}
        </div>
      </section>

      {isAdmin && overview ? (
        <section className="grid gap-4">
          <h2 className="text-base font-medium">Practice</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AttentionCard label="Doctors" metric={overview.doctors} href="/admin/doctors" icon={Stethoscope} actionLabel="Manage" />
            <AttentionCard label="Staff" metric={overview.staff} href="/admin/users" icon={UserCog} actionLabel="Manage" />
            <AttentionCard label="Branches" metric={overview.branches} href="/admin/settings" icon={Building2} actionLabel="Manage" />
          </div>
        </section>
      ) : null}

      {isAdmin && activity ? <ActivityList activity={activity} /> : null}
    </div>
  );
}
