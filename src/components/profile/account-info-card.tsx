import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Read-only view of the account TV Care has on file — the sign-in identity, distinct from any role-specific record. */
export function AccountInfoCard({
  fullName,
  email,
  phone,
}: {
  fullName: string;
  email: string;
  phone: string | null;
}) {
  const details = [
    { label: "Full name", value: fullName },
    { label: "Email", value: email },
    { label: "Mobile number", value: phone ?? "Not recorded" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
        <CardDescription>Your sign-in identity.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {details.map((detail) => (
            <div key={detail.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="text-right">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
