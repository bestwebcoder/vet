import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  History,
  Scissors,
  Stethoscope,
  Syringe,
  Users,
} from "lucide-react";

import { ActivityList } from "@/components/dashboard/activity-list";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { countAppointments } from "@/features/appointments/queries";
import { getDoctorOverview, getRecentActivity } from "@/features/dashboard/queries";
import { requireRole } from "@/features/auth/session";
import { getOwnDoctorRecord } from "@/features/doctors/queries";
import { listDraftSoapRecordsForDoctor, listFollowUpsDueForDoctor } from "@/features/soap/queries";
import { listPracticeVaccinationStatuses } from "@/features/vaccinations/queries";
import { firstName } from "@/lib/names";
import { getDueInfo } from "@/lib/due-window";
import type { Metric } from "@/features/dashboard/queries";

const NOT_OCCUPYING = ["cancelled", "no_show"];

export default async function DoctorDashboardPage() {
  const user = await requireRole("doctor");
  const doctor = await getOwnDoctorRecord();

  const organizationId = user.organizationIds[0];
  const [overview, activity] = await Promise.all([
    getDoctorOverview(),
    organizationId ? getRecentActivity(organizationId) : Promise.resolve({ status: "error" as const }),
  ]);

  let today: Metric = { status: "error" };
  let upcoming: Metric = { status: "error" };
  let emergency: Metric = { status: "error" };
  let followUp: Metric = { status: "error" };
  let surgery: Metric = { status: "error" };
  let recentlySeen: Metric = { status: "error" };
  let recordsToComplete: Metric = { status: "error" };
  let followUpsDue: Metric = { status: "error" };

  const vaccinationStatuses = await listPracticeVaccinationStatuses();
  const vaccinationsDue: Metric =
    vaccinationStatuses.status === "ok"
      ? {
          status: "ok",
          value: vaccinationStatuses.data.filter((row) => ["due_in_7", "due_today", "overdue"].includes(getDueInfo(row.nextDueDate).status))
            .length,
        }
      : { status: "error" };

  if (doctor.status === "ok" && doctor.data) {
    const doctorId = doctor.data.id;
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    [today, upcoming, emergency, followUp, surgery, recentlySeen] = await Promise.all([
      countAppointments({
        doctorId,
        from: startOfToday.toISOString(),
        to: startOfTomorrow.toISOString(),
        excludeStatuses: NOT_OCCUPYING,
      }),
      countAppointments({
        doctorId,
        from: startOfTomorrow.toISOString(),
        excludeStatuses: NOT_OCCUPYING,
      }),
      countAppointments({
        doctorId,
        visitType: "emergency",
        from: now.toISOString(),
        excludeStatuses: NOT_OCCUPYING,
      }),
      countAppointments({
        doctorId,
        visitType: "follow_up",
        from: now.toISOString(),
        excludeStatuses: NOT_OCCUPYING,
      }),
      countAppointments({
        doctorId,
        visitType: "surgery",
        from: now.toISOString(),
        excludeStatuses: NOT_OCCUPYING,
      }),
      countAppointments({
        doctorId,
        statuses: ["completed"],
        from: thirtyDaysAgo.toISOString(),
        to: now.toISOString(),
      }),
    ]);

    const [draftsResult, followUpsResult] = await Promise.all([
      listDraftSoapRecordsForDoctor(doctorId),
      listFollowUpsDueForDoctor(doctorId),
    ]);

    recordsToComplete =
      draftsResult.status === "ok" ? { status: "ok", value: draftsResult.data.length } : { status: "error" };
    followUpsDue =
      followUpsResult.status === "ok" ? { status: "ok", value: followUpsResult.data.length } : { status: "error" };
  }

  return (
    <div className="grid gap-8">
      <DashboardHeader
        title="Today"
        subtitle={`${firstName(user.fullName)}, here is what needs your attention.`}
      />

      <section className="grid gap-4">
        <h2 className="text-base font-medium">Appointments</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AttentionCard label="Today" metric={today} href="/doctor/calendar" icon={CalendarDays} />
          <AttentionCard label="Upcoming" metric={upcoming} href="/doctor/appointments" icon={CalendarClock} />
          <AttentionCard label="Emergencies" metric={emergency} href="/doctor/appointments" icon={AlertTriangle} />
          <AttentionCard label="Follow-up visits" metric={followUp} href="/doctor/appointments" icon={Stethoscope} />
          <AttentionCard label="Surgery schedule" metric={surgery} href="/doctor/appointments" icon={Scissors} />
          <AttentionCard
            label="Recently seen"
            metric={recentlySeen}
            href="/doctor/appointments"
            icon={CalendarCheck}
            description="Last 30 days"
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="sr-only">Clinical</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard
            label="Records to complete"
            metric={recordsToComplete}
            href="/doctor/soap"
            icon={ClipboardList}
          />
          <AttentionCard
            label="Follow-ups due"
            metric={followUpsDue}
            href="/doctor/follow-ups"
            icon={History}
          />
          <AttentionCard
            label="Vaccinations due"
            metric={vaccinationsDue}
            href="/doctor/vaccinations"
            icon={Syringe}
          />
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-base font-medium">Your practice</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard
            label="Clients at this practice"
            metric={overview.clients}
            href="/doctor/patients"
            icon={Users}
          />
          <AttentionCard
            label="Doctors at this practice"
            metric={overview.colleagues}
            href="/doctor/patients"
            icon={Stethoscope}
          />
        </div>
      </section>

      <ActivityList
        activity={activity}
        // Policy scopes the audit trail to this doctor's own actions.
        description="Your recent activity, newest first."
      />
    </div>
  );
}
