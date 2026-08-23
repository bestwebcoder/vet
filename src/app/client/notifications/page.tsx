import type { Metadata } from "next";

import { ErrorState } from "@/components/states/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { PushToggle } from "@/components/notifications/push-toggle";
import { requireRole } from "@/features/auth/session";
import { getMyNotificationPreferences } from "@/features/notifications/queries";

export const metadata: Metadata = { title: "Notifications · TV Care" };

export default async function ClientNotificationsPage() {
  const user = await requireRole("client");

  const preferences = await getMyNotificationPreferences(user.id);
  if (preferences.status === "error") {
    return (
      <Card>
        <CardContent>
          <ErrorState title="Your notification preferences could not be loaded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <h1>Notifications</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This device</CardTitle>
        </CardHeader>
        <CardContent>
          <PushToggle userId={user.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you receive</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            Everything is on by default. Turn a channel off for a notification you would rather not get.
          </p>
          <PreferencesForm userId={user.id} matrix={preferences.data} />
        </CardContent>
      </Card>
    </div>
  );
}
