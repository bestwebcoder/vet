import { History } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeAction, type RecentActivity } from "@/features/dashboard/queries";

const DHAKA_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  // Stored as timestamptz in UTC; the practice reads it in local time.
  timeZone: "Asia/Dhaka",
});

export function ActivityList({
  activity,
  description = "From the audit trail, newest first.",
}: {
  activity: RecentActivity;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent activity</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.status === "error" ? (
          <ErrorState
            title="Activity could not be loaded"
            description="The audit trail is unavailable just now. Records are unaffected."
          />
        ) : activity.entries.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing recorded yet"
            description="Actions taken in TV Care appear here as they happen."
          />
        ) : (
          <ul className="grid gap-3">
            {activity.entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-4 text-sm">
                <span>{describeAction(entry.action)}</span>
                <span data-numeric className="text-muted-foreground shrink-0 text-xs">
                  {DHAKA_TIME.format(new Date(entry.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
