import { describe, expect, it } from "vitest";

import { firstName } from "@/lib/names";

describe("firstName", () => {
  it.each([
    ["Farhana Islam", "Farhana"],
    ["Dr Imran Hossain", "Imran"],
    ["Dr. Imran Hossain", "Imran"],
    ["Md. Rashed Karim", "Rashed"],
    ["Md Rashed Karim", "Rashed"],
    ["Mst. Nusrat Jahan", "Nusrat"],
    ["Prof. Anwara Begum", "Anwara"],
    ["Nusrat", "Nusrat"],
    ["  Rashed   Karim  ", "Rashed"],
  ])("greets %s as %s", (input, expected) => {
    expect(firstName(input)).toBe(expected);
  });

  it("keeps a name that is only a title rather than greeting nobody", () => {
    expect(firstName("Dr")).toBe("Dr");
  });

  it("does not strip Mohammad, which is usually the given name itself", () => {
    expect(firstName("Mohammad Ali")).toBe("Mohammad");
  });
});
