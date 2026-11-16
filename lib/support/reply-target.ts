const PACIFIC_TIME_ZONE = "America/Los_Angeles";
const pacificCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function calendarParts(timestamp: number) {
  const parts = pacificCalendar.formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function pacificNoon(calendarDate: Date): number {
  const utcNoon = calendarDate.getTime();
  const pacific = calendarParts(utcNoon);
  const offset = Date.UTC(
    pacific.year,
    pacific.month - 1,
    pacific.day,
    pacific.hour,
    pacific.minute,
    pacific.second,
  ) - utcNoon;

  // Pacific DST changes happen before both UTC noon and local noon, so the
  // offset at this anchor also applies to that calendar day's local noon.
  return utcNoon - offset;
}

/** Next strictly future weekday noon in Pacific time. No holiday calendar applies. */
export function nextReplyTarget(now: number): number {
  if (!Number.isFinite(now)) throw new RangeError("A valid timestamp is required.");
  const { year, month, day } = calendarParts(now);
  // UTC is used only for calendar arithmetic, never as the support time zone.
  const candidateDate = new Date(Date.UTC(year, month - 1, day, 12));

  for (;;) {
    const weekday = candidateDate.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      const target = pacificNoon(candidateDate);
      if (target > now) return target;
    }
    candidateDate.setUTCDate(candidateDate.getUTCDate() + 1);
  }
}

/** Total hours are deliberately not wrapped at 24 across weekends. */
export function formatReplyCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}
