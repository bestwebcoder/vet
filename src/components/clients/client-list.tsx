import { Users } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import type { ClientDetail } from "@/features/clients/queries";

/**
 * A list of clients. Rendered as rows rather than a table: at 375px a table of
 * five columns is unreadable, and this is used on a phone during home visits.
 */
export function ClientList({
  clients,
  basePath,
  search,
}: {
  clients: ClientDetail[];
  basePath: string;
  search?: string;
}) {
  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={search ? `Nobody matches “${search}”` : "No clients yet"}
        description={
          search
            ? "Try a name, a mobile number, or part of an email address."
            : "Clients added here can book appointments and see their pets' records."
        }
      />
    );
  }

  return (
    <ul className="divide-border grid divide-y">
      {clients.map((client) => (
        <li key={client.id}>
          <Link
            href={`${basePath}/${client.id}`}
            className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex min-h-11 items-center gap-4 rounded-lg px-2 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium">{client.fullName}</span>
              <span className="text-muted-foreground text-sm" data-numeric>
                {client.phone}
                {client.city ? ` · ${client.city}` : ""}
              </span>
            </div>

            <span className="text-muted-foreground shrink-0 text-sm">
              {client.petCount === 1 ? "1 pet" : `${client.petCount} pets`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
