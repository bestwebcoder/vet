import { describe, expect, it } from "vitest";

import type { ServiceSummary } from "@/features/services/queries";
import {
  categoriesFor,
  categoriesForCatalogue,
  dedicatedServicePageFor,
  intoCategories,
  isAdvisoryCategory,
} from "@/lib/service-pages";

function service(overrides: Partial<ServiceSummary> & { id: string; name: string }): ServiceSummary {
  return {
    description: null,
    durationMinutes: 30,
    categoryId: null,
    categoryName: null,
    categoryDescription: null,
    categoryIcon: null,
    categorySortOrder: Number.MAX_SAFE_INTEGER,
    tagline: null,
    inclusionsLabel: null,
    inclusions: [],
    feeLabel: null,
    feeTiers: [],
    feeNote: null,
    pricePaisa: 0,
    price: "৳0",
    taxRatePercent: 0,
    isHomeVisitAvailable: false,
    isHomeVisitFee: false,
    requiresDoctor: false,
    isActive: true,
    ...overrides,
  };
}

function inCategory(id: string, name: string, sortOrder: number, serviceName: string): ServiceSummary {
  return service({
    id: `${id}-${serviceName}`,
    name: serviceName,
    categoryId: id,
    categoryName: name,
    categorySortOrder: sortOrder,
  });
}

describe("intoCategories", () => {
  it("groups in the order an admin arranged the categories", () => {
    const groups = intoCategories([
      inCategory("c", "Consulting Services", 3, "Practice setup"),
      inCategory("a", "Home Veterinary Care", 1, "Home visit"),
      inCategory("b", "Community Care", 2, "Vaccination drive"),
    ]);

    expect(groups.map((group) => group.name)).toEqual([
      "Home Veterinary Care",
      "Community Care",
      "Consulting Services",
    ]);
  });

  it("collects uncategorised services under one heading, sorted last", () => {
    const groups = intoCategories([
      service({ id: "loose-1", name: "Nail trim" }),
      inCategory("a", "Home Veterinary Care", 1, "Home visit"),
      service({ id: "loose-2", name: "Microchipping" }),
    ]);

    expect(groups.at(-1)?.name).toBe("Other services");
    expect(groups.at(-1)?.services.map((entry) => entry.name)).toEqual(["Nail trim", "Microchipping"]);
  });

  it("keeps categories sharing a position in a stable alphabetical order", () => {
    const groups = intoCategories([
      inCategory("b", "Surgery", 10, "Spay"),
      inCategory("a", "Dentistry", 10, "Scale and polish"),
    ]);

    expect(groups.map((group) => group.name)).toEqual(["Dentistry", "Surgery"]);
  });
});

describe("dedicatedServicePageFor", () => {
  it.each(["Training & Education", "Student Mentorship", "OWNER EDUCATION"])("sends %s to its own page", (name) => {
    expect(dedicatedServicePageFor(name)?.href).toBe("/training-education");
  });

  it.each(["Home Veterinary Care", "Consulting Services", "Community Care Services"])(
    "leaves %s on the catalogue",
    (name) => {
      expect(dedicatedServicePageFor(name)).toBeUndefined();
    },
  );
});

describe("the split between /services and its dedicated pages", () => {
  const groups = intoCategories([
    inCategory("a", "Home Veterinary Care", 1, "Home visit"),
    inCategory("c", "Consulting Services", 3, "Practice setup"),
    inCategory("t", "Training & Education", 4, "Staff training"),
  ]);

  it("shows every category exactly once across the two pages", () => {
    const shown = [...categoriesForCatalogue(groups), ...categoriesFor(groups, "/training-education")];

    expect(shown.map((group) => group.name).sort()).toEqual(
      groups.map((group) => group.name).sort(),
    );
  });

  it("keeps teaching work off the catalogue", () => {
    expect(categoriesForCatalogue(groups).map((group) => group.name)).toEqual([
      "Home Veterinary Care",
      "Consulting Services",
    ]);
  });

  it("gives an unclaimed route nothing rather than everything", () => {
    expect(categoriesFor(groups, "/nowhere")).toEqual([]);
  });
});

describe("isAdvisoryCategory", () => {
  it.each(["Consulting Services", "Training & Education", "Student Mentorship"])("accents %s in gold", (name) => {
    expect(isAdvisoryCategory(name)).toBe(true);
  });

  it.each(["Home Veterinary Care", "Vaccination", "Surgery"])("leaves %s as treatment", (name) => {
    expect(isAdvisoryCategory(name)).toBe(false);
  });
});
