import { CalendarDays, PawPrint, Receipt, Search, Stethoscope, Users, Wallet } from "lucide-react";
import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";

import { SearchField } from "@/components/search/search-field";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAccess } from "@/features/auth/access";
import { globalSearch } from "@/features/search/queries";

export const metadata: Metadata = { title: "Search · TV Care" };

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/search">) {
  await requireAccess("shared");
  const { q } = await searchParams;
  const term = typeof q === "string" ? q : "";

  const results = term ? await globalSearch(term) : null;
  const hasResults =
    results &&
    (results.clients.length > 0 ||
      results.pets.length > 0 ||
      results.doctors.length > 0 ||
      results.appointments.length > 0 ||
      results.invoices.length > 0 ||
      results.payments.length > 0);

  return (
    <div className="grid gap-6">
      <h1>Search</h1>
      <SearchField
        action="/admin/search"
        defaultValue={term}
        placeholder="Name, phone, pet, doctor, invoice, reference or date (yyyy-mm-dd)"
        label="Search"
      />

      {!term ? null : !hasResults ? (
        <Card>
          <CardContent>
            <EmptyState icon={Search} title={`Nothing matches "${term}"`} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {results!.pets.length > 0 ? (
            <ResultCard icon={PawPrint} title="Patients">
              {results!.pets.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/admin/patients/${pet.id}`}
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium">{pet.name}</span>
                  <span className="text-muted-foreground ml-2">· {pet.ownerName}</span>
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {results!.clients.length > 0 ? (
            <ResultCard icon={Users} title="Clients">
              {results!.clients.map((client) => (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium">{client.fullName}</span>
                  <span className="text-muted-foreground ml-2" data-numeric>
                    · {client.phone}
                  </span>
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {results!.doctors.length > 0 ? (
            <ResultCard icon={Stethoscope} title="Doctors">
              {results!.doctors.map((doctor) => (
                <Link
                  key={doctor.id}
                  href="/admin/doctors"
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium">{doctor.fullName}</span>
                  {doctor.specialization ? (
                    <span className="text-muted-foreground ml-2">· {doctor.specialization}</span>
                  ) : null}
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {results!.appointments.length > 0 ? (
            <ResultCard icon={CalendarDays} title="Appointments">
              {results!.appointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/admin/appointments/${appointment.id}`}
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium" data-numeric>
                    {format(new Date(appointment.startsAt), "d MMM yyyy · h:mm a")}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    · {appointment.clientName} · {appointment.petName} · {appointment.status}
                  </span>
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {results!.invoices.length > 0 ? (
            <ResultCard icon={Receipt} title="Invoices">
              {results!.invoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/admin/invoices/${invoice.id}`}
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium" data-numeric>
                    {invoice.invoiceNumber}
                  </span>
                  <span className="text-muted-foreground ml-2">· {invoice.clientName}</span>
                </Link>
              ))}
            </ResultCard>
          ) : null}

          {results!.payments.length > 0 ? (
            <ResultCard icon={Wallet} title="Payments">
              {results!.payments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/admin/invoices/${payment.invoiceId}`}
                  className="hover:bg-muted/50 -mx-2 flex min-h-11 items-center rounded-lg px-2 py-2 text-sm"
                >
                  <span className="font-medium" data-numeric>
                    {payment.amount}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    · {payment.invoiceNumber ?? "Unknown invoice"} · {payment.clientName ?? "Unknown client"} ·{" "}
                    {format(new Date(payment.paidAt), "d MMM yyyy")}
                  </span>
                </Link>
              ))}
            </ResultCard>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Search;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid">{children}</CardContent>
    </Card>
  );
}
