import { describe, expect, it } from "vitest";

import { ADMIN_NAV, navFor } from "@/components/shell/navigation";
import { ACCESS, ADMIN_ONLY } from "@/features/auth/access";

/**
 * The /admin menu is shared by administrators and the three narrower
 * clinic-side roles, so what each one sees is worth asserting rather than
 * eyeballing. This is presentation only — row level security decides what any
 * of them can actually reach (tests/staff-roles.test.ts); a wrong answer here
 * is a confusing menu, not a leak.
 */

function labels(roles: Parameters<typeof navFor>[1]) {
  return navFor("admin", roles).map((item) => item.label);
}

describe("admin navigation is filtered per role", () => {
  it("shows an administrator everything", () => {
    expect(labels(["admin"])).toEqual(ADMIN_NAV.map((item) => item.label));
  });

  it("shows a finance manager money and nothing else", () => {
    expect(labels(["finance_manager"])).toEqual(["Dashboard", "Billing", "Payments", "Reports"]);
  });

  it("shows a lab user their own queue", () => {
    expect(labels(["lab"])).toEqual(["Dashboard", "Lab"]);
  });

  it("shows a receptionist the front desk", () => {
    expect(labels(["receptionist"])).toEqual([
      "Dashboard",
      "Appointments",
      "Doctors",
      "Services",
      "Vaccinations",
      "Deworming",
      "Notifications",
      "Messages",
    ]);
  });

  it("keeps the practice's own administration out of every narrower role", () => {
    for (const role of ["finance_manager", "lab", "receptionist"] as const) {
      const visible = labels([role]);
      expect(visible).not.toContain("Users");
      expect(visible).not.toContain("Settings");
      expect(visible).not.toContain("Website");
      expect(visible).not.toContain("Clients");
      expect(visible).not.toContain("Patients");
    }
  });

  it("unions the menu for someone holding two roles", () => {
    expect(labels(["finance_manager", "lab"])).toEqual(["Dashboard", "Lab", "Billing", "Payments", "Reports"]);
  });

  it("hides an item that never declared its roles from everyone but an administrator", () => {
    const undeclared = ADMIN_NAV.filter((item) => item.roles === undefined);
    expect(undeclared.length).toBeGreaterThan(0);

    for (const item of undeclared) {
      expect(navFor("admin", ["receptionist"])).not.toContainEqual(item);
    }
  });
});

describe("the access map and the menu agree", () => {
  it("gives every role in ACCESS at least the dashboard", () => {
    for (const roles of [ACCESS.finance, ACCESS.lab, ACCESS.reception, ACCESS.shared]) {
      expect(navFor("admin", roles).map((item) => item.label)).toContain("Dashboard");
    }
  });

  it("treats an omitted `roles` as administrators only", () => {
    expect(ADMIN_ONLY).toEqual(["admin", "super_admin"]);
  });
});
