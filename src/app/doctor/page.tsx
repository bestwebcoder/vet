import { CalendarDays, ClipboardList, Stethoscope, Syringe, Users } from "lucide-react";

import { ActivityList } from "@/components/dashboard/activity-list";
import { AttentionCard } from "@/components/dashboard/attention-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { getDoctorOverview, getRecentActivity } from "@/features/dashboard/queries";
import { requireRole } from "@/features/auth/session";
import { firstName } from "@/lib/names";

export default async function DoctorDashboardPage() {
  const user = await requireRole("doctor");
  const [overview, activity] = await Promise.all([getDoctorOverview(), getRecentActivity()]);

  return (
    <div className="grid gap-8">
      <DashboardHeader
        title="Today"
        subtitle={`${firstName(user.fullName)}, here is what needs your attention.`}
      />

      <section className="grid gap-4">
        <h2 className="sr-only">Needs attention</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <AttentionCard
            label="Appointments today"
            metric={{ status: "pending", phase: 3 }}
            href="/doctor/appointments"
            icon={CalendarDays}
          />
          <AttentionCard
            label="Records to complete"
            metric={{ status: "pending", phase: 4 }}
            href="/doctor/soap"
            icon={ClipboardList}
          />
          <AttentionCard
            label="Follow-ups due"
            metric={{ status: "pending", phase: 4 }}
            href="/doctor/follow-ups"
            icon={Stethoscope}
          />
          <AttentionCard
            label="Vaccinations due"
            metric={{ status: "pending", phase: 6 }}
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
