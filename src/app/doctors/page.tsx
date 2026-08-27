import type { Metadata } from "next";
import { Stethoscope } from "lucide-react";

import { DoctorCard } from "@/components/marketing/doctor-card";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { Pagination } from "@/components/search/pagination";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { getPublicDoctors, type PublicDoctor } from "@/features/doctors/queries";
import { getPublicOrganizationInfo } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "Doctors · TV Care" };

/** Five per row on a wide screen, four rows deep. */
const PAGE_SIZE = 20;

/**
 * Doctors who have not stated a specialization.
 *
 * Says only what is true of everyone listed. "General practice" would read
 * more naturally but is a claim about how they work that nobody at the
 * practice has made.
 */
const UNSPECIALIZED = "Our veterinarians";

/**
 * Specializations first and alphabetical, the rest last.
 *
 * Which way round matters: most of a practice states no specialization, so
 * leading with them would push every specialist onto the last pages — the
 * opposite of what someone choosing a doctor is scanning for. Within a group
 * the lead doctor comes first, then by name.
 */
function bySpecializationThenName(a: PublicDoctor, b: PublicDoctor) {
  const groupA = a.specialization?.trim() || null;
  const groupB = b.specialization?.trim() || null;

  if (groupA !== groupB) {
    if (groupA === null) return 1;
    if (groupB === null) return -1;
    return groupA.localeCompare(groupB);
  }

  if (a.isLeadDoctor !== b.isLeadDoctor) return Number(b.isLeadDoctor) - Number(a.isLeadDoctor);
  return a.fullName.localeCompare(b.fullName);
}

function groupOf(doctor: PublicDoctor): string {
  return doctor.specialization?.trim() || UNSPECIALIZED;
}

/** Consecutive doctors sharing a specialization, as they fall on this page. */
function intoGroups(doctors: PublicDoctor[]): { heading: string; doctors: PublicDoctor[] }[] {
  const groups: { heading: string; doctors: PublicDoctor[] }[] = [];

  for (const doctor of doctors) {
    const heading = groupOf(doctor);
    const last = groups.at(-1);
    if (last?.heading === heading) last.doctors.push(doctor);
    else groups.push({ heading, doctors: [doctor] });
  }

  return groups;
}

export default async function DoctorsPage({ searchParams }: PageProps<"/doctors">) {
  const organization = await getPublicOrganizationInfo();
  // No practice resolved means nothing to show — never everything.
  const doctorsResult = organization
    ? await getPublicDoctors(organization.id)
    : { status: "ok" as const, data: [] };
  const practiceName = organization?.name ?? "The Traveling Vet";

  const { page: pageParam } = await searchParams;
  const page = typeof pageParam === "string" ? Math.max(1, Number(pageParam) || 1) : 1;

  const doctors = doctorsResult.status === "ok" ? [...doctorsResult.data].sort(bySpecializationThenName) : [];

  // A page past the end shows the last one rather than an empty grid.
  const totalPages = Math.max(1, Math.ceil(doctors.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const groups = intoGroups(doctors.slice(start, start + PAGE_SIZE));

  return (
    <div className="flex min-h-svh flex-col">
      <PublicHeader practiceName={practiceName} logoUrl={organization?.logoUrl ?? null} organizationId={organization?.id ?? null} />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Our doctors</h1>
          <p className="text-muted-foreground mt-6 text-lg text-balance">
            Every appointment at {practiceName} is with one of our veterinarians — choose the one you&rsquo;d
            like to see when you book.
          </p>
        </section>

        <section className="border-border/60 border-t bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6">
            {doctorsResult.status === "error" ? (
              <ErrorState title="Doctors could not be loaded" />
            ) : doctors.length === 0 ? (
              <EmptyState
                icon={Stethoscope}
                title="No doctors listed yet"
                description="Check back soon — our veterinarians will appear here once they've joined the practice."
              />
            ) : (
              <>
                {groups.map((group) => (
                  <div key={group.heading} className="grid gap-5">
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-xl font-semibold tracking-tight">{group.heading}</h2>
                      <span className="text-muted-foreground text-sm tabular-nums">
                        {group.doctors.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {group.doctors.map((doctor) => (
                        <DoctorCard key={doctor.id} doctor={doctor} compact />
                      ))}
                    </div>
                  </div>
                ))}

                <Pagination
                  basePath="/doctors"
                  searchParams={{}}
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  totalCount={doctors.length}
                />
              </>
            )}
          </div>
        </section>
      </main>

      <PublicFooter organization={organization} />
    </div>
  );
}
