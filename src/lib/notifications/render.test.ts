import { describe, expect, it } from "vitest";

import { buildContent, renderTemplate } from "@/lib/notifications/render";

describe("renderTemplate", () => {
  it("interpolates known placeholders", () => {
    expect(renderTemplate("Hi {{title}}, see {{body}}", { title: "Rex", body: "the news" })).toBe(
      "Hi Rex, see the news",
    );
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderTemplate("{{ title }}", { title: "Rex" })).toBe("Rex");
  });

  it("leaves an unknown placeholder untouched", () => {
    expect(renderTemplate("Hi {{unknown}}", { title: "Rex" })).toBe("Hi {{unknown}}");
  });
});

describe("buildContent", () => {
  const notification = { title: "Vaccination due: Rabies", body: "Next due 12 Aug 2026." };

  it("falls back to title/body for email with no template", () => {
    expect(buildContent(notification, "email", null)).toEqual({
      subject: notification.title,
      body: notification.body,
    });
  });

  it("falls back to a combined title: body line for sms with no template", () => {
    expect(buildContent(notification, "sms", null)).toEqual({
      body: "Vaccination due: Rabies: Next due 12 Aug 2026.",
    });
  });

  it("renders an active template when one is provided", () => {
    const result = buildContent(notification, "email", {
      subjectTemplate: "Reminder: {{title}}",
      bodyTemplate: "{{body}}\n\n— The Traveling Vet",
    });

    expect(result).toEqual({
      subject: "Reminder: Vaccination due: Rabies",
      body: "Next due 12 Aug 2026.\n\n— The Traveling Vet",
    });
  });

  it("uses the notification title as the subject when a template has none", () => {
    const result = buildContent(notification, "email", { subjectTemplate: null, bodyTemplate: "{{title}}" });
    expect(result.subject).toBe(notification.title);
  });
});
