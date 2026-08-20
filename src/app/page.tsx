import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Placeholder landing for a signed-in user. Role-routed dashboards replace
 * this later in Phase 1; it exists now so the auth flow can be walked
 * end to end.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, phone")
    .eq("id", claims.claims.sub)
    .single();

  const { data: roles } = await supabase
    .from("user_roles")
    .select("roles(name), organizations(name)")
    .is("revoked_at", null);

  return (
    <main className="bg-muted/40 min-h-svh px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Signed in as {profile?.full_name ?? "your account"}</CardTitle>
            <CardDescription>{profile?.email}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Mobile</dt>
                <dd>{profile?.phone ?? "Not provided"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="text-right">
                  {roles?.length
                    ? roles
                        .map((row) => {
                          const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
                          const org = Array.isArray(row.organizations)
                            ? row.organizations[0]
                            : row.organizations;
                          return [role?.name, org?.name].filter(Boolean).join(" · ");
                        })
                        .join(", ")
                    : "No role assigned"}
                </dd>
              </div>
            </dl>

            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="touch" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
