import { describe, expect, it, vi } from "vitest";

import { loggingProvider } from "@/lib/notifications/providers/logging";

describe("loggingProvider", () => {
  it("never fabricates a successful send", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = loggingProvider("sms");

    const result = await provider.send({ to: "+8801712345678", body: "Vaccination due" });

    expect(result).toEqual({ success: false, reason: "no provider configured", retryable: false });
    vi.restoreAllMocks();
  });

  it("logs the content that would have been sent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = loggingProvider("whatsapp");

    await provider.send({ to: "+8801712345678", subject: "Reminder", body: "Vaccination due" });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("whatsapp"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("+8801712345678"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Vaccination due"));
    vi.restoreAllMocks();
  });
});
