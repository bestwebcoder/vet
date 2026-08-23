/**
 * Quiet hours (§9.4) are configured as plain HH:mm bounds in the practice's
 * own timezone (`organizations.timezone`), and only ever defer sms/whatsapp/
 * push — email is never deferred. A window where `start > end` wraps past
 * midnight (e.g. 22:00–07:00).
 */

/** HH:mm in `timezone`, right now. */
function localTimeOfDay(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

export function isWithinQuietHours(
  start: string | null,
  end: string | null,
  timezone: string,
  now: Date,
): boolean {
  if (!start || !end || start === end) return false;

  const local = localTimeOfDay(now, timezone);
  return start < end ? local >= start && local < end : local >= start || local < end;
}

/**
 * The next real UTC instant at which `end` (HH:mm, in `timezone`) occurs —
 * today if it hasn't passed yet in local time, tomorrow otherwise. Used to
 * reschedule a deferred send past the end of the quiet window.
 */
export function nextAllowedSendTime(end: string, timezone: string, now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)!.value;

  // The org's local wall-clock, reinterpreted as if it were UTC, minus the
  // real UTC instant, gives the timezone's current offset from UTC.
  const localAsUtcMs = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")),
    Number(get("minute")),
    Number(get("second")),
  );
  const offsetMs = localAsUtcMs - now.getTime();

  const [endHour, endMinute] = end.split(":").map(Number);
  let targetLocalAsUtcMs = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    endHour,
    endMinute,
    0,
  );

  if (targetLocalAsUtcMs <= localAsUtcMs) {
    targetLocalAsUtcMs += 24 * 60 * 60 * 1000;
  }

  return new Date(targetLocalAsUtcMs - offsetMs);
}
