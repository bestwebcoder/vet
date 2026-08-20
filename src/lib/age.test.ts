import { describe, expect, it } from "vitest";

import { ageFrom, formatAge, parseDateOnly, todayInDhaka } from "@/lib/age";

// A fixed instant, so these tests do not change meaning tomorrow.
const NOW = new Date("2026-08-20T04:00:00.000Z");

describe("todayInDhaka", () => {
  it("uses the practice's own calendar day", () => {
    // 20:00 UTC is already the next day in Dhaka (UTC+6).
    const lateEvening = new Date("2026-08-20T20:00:00.000Z");
    expect(todayInDhaka(lateEvening).getDate()).toBe(21);
  });
});

describe("ageFrom", () => {
  it("breaks an age into years, months and days", () => {
    expect(ageFrom("2022-05-10", NOW)).toEqual({ years: 4, months: 3, days: 10 });
  });

  it("handles a birthday earlier today", () => {
    expect(ageFrom("2022-08-20", NOW)).toEqual({ years: 4, months: 0, days: 0 });
  });

  it("returns nothing for a date in the future", () => {
    expect(ageFrom("2030-01-01", NOW)).toBeNull();
  });

  it("copes with a leap day birth", () => {
    expect(ageFrom("2024-02-29", NOW)?.years).toBe(2);
  });
});

describe("formatAge", () => {
  it.each([
    ["2022-05-10", "4 years"],
    ["2025-05-10", "1 year 3 months"],
    ["2025-08-20", "1 year"],
    ["2026-02-10", "6 months"],
    ["2026-08-14", "6 days"],
    ["2026-08-20", "0 days"],
  ])("renders %s as %s", (dob, expected) => {
    expect(formatAge(dob, { now: NOW })).toBe(expected);
  });

  it("marks an estimated birth date, which means something different clinically", () => {
    expect(formatAge("2022-05-10", { isEstimated: true, now: NOW })).toBe("About 4 years");
  });

  it("says the age is unknown rather than guessing", () => {
    expect(formatAge(null, { now: NOW })).toBe("Age unknown");
    expect(formatAge(undefined, { now: NOW })).toBe("Age unknown");
  });

  it("singularises correctly", () => {
    expect(formatAge("2025-08-20", { now: NOW })).toBe("1 year");
    expect(formatAge("2026-07-20", { now: NOW })).toBe("1 month");
    expect(formatAge("2026-08-19", { now: NOW })).toBe("1 day");
  });
});

describe("parseDateOnly", () => {
  it("reads a calendar date without timezone drift", () => {
    const date = parseDateOnly("2026-01-01");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});
