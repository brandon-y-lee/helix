import { afterEach, describe, expect, it } from "vitest";
import { formatReplyCountdown, nextReplyTarget } from "@/lib/support/reply-target";

const initialTimeZone = process.env.TZ;
afterEach(() => {
  if (initialTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = initialTimeZone;
});

describe("Pacific weekday reply target", () => {
  it.each([
    ["before winter noon", "2026-01-14T19:59:59.999Z", "2026-01-14T20:00:00Z"],
    ["at winter noon", "2026-01-14T20:00:00Z", "2026-01-15T20:00:00Z"],
    ["after winter noon", "2026-01-14T20:00:00.001Z", "2026-01-15T20:00:00Z"],
    ["before summer noon", "2026-07-15T18:59:59Z", "2026-07-15T19:00:00Z"],
    ["at summer noon", "2026-07-15T19:00:00Z", "2026-07-16T19:00:00Z"],
    ["Friday before noon", "2026-10-16T18:59:59Z", "2026-10-16T19:00:00Z"],
    ["Friday at noon", "2026-10-16T19:00:00Z", "2026-10-19T19:00:00Z"],
    ["Friday after noon", "2026-10-16T23:00:00Z", "2026-10-19T19:00:00Z"],
    ["Saturday", "2026-10-17T19:00:00Z", "2026-10-19T19:00:00Z"],
    ["Sunday", "2026-10-18T19:00:00Z", "2026-10-19T19:00:00Z"],
    ["UTC Monday is still Pacific Sunday", "2026-10-19T02:00:00Z", "2026-10-19T19:00:00Z"],
    ["UTC Saturday is still Pacific Friday", "2026-10-17T01:00:00Z", "2026-10-19T19:00:00Z"],
    ["month boundary", "2026-04-30T19:00:00Z", "2026-05-01T19:00:00Z"],
    ["year boundary", "2026-12-31T20:00:00Z", "2027-01-01T20:00:00Z"],
    ["leap day", "2024-02-28T20:00:00Z", "2024-02-29T20:00:00Z"],
    ["after leap day", "2024-02-29T20:00:00Z", "2024-03-01T20:00:00Z"],
    ["spring DST weekend", "2026-03-06T20:00:00Z", "2026-03-09T19:00:00Z"],
    ["spring DST Sunday", "2026-03-08T10:00:00Z", "2026-03-09T19:00:00Z"],
    ["fall DST weekend", "2026-10-30T19:00:00Z", "2026-11-02T20:00:00Z"],
    ["fall first repeated hour", "2026-11-01T08:30:00Z", "2026-11-02T20:00:00Z"],
    ["fall second repeated hour", "2026-11-01T09:30:00Z", "2026-11-02T20:00:00Z"],
  ])("uses the next local weekday noon: %s", (_name, now, target) => {
    expect(nextReplyTarget(Date.parse(now))).toBe(Date.parse(target));
  });

  it.each(["UTC", "Asia/Tokyo", "America/New_York"])("does not depend on the host time zone (%s)", (timeZone) => {
    process.env.TZ = timeZone;
    expect(nextReplyTarget(Date.parse("2026-03-06T20:00:00Z"))).toBe(Date.parse("2026-03-09T19:00:00Z"));
  });

  it("uses weekdays only without inventing a holiday calendar", () => {
    expect(nextReplyTarget(Date.parse("2026-12-25T19:00:00Z"))).toBe(Date.parse("2026-12-25T20:00:00Z"));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects an invalid instant (%s)", (now) => {
    expect(() => nextReplyTarget(now)).toThrow(RangeError);
  });
});

describe("reply countdown display", () => {
  it.each([
    [0, "00:00:00"],
    [-1000, "00:00:00"],
    [1, "00:00:01"],
    [1001, "00:00:02"],
    [3_661_000, "01:01:01"],
    [24 * 3_600_000, "24:00:00"],
    [71 * 3_600_000, "71:00:00"],
    [73 * 3_600_000, "73:00:00"],
    [101 * 3_600_000, "101:00:00"],
  ])("formats %s ms as %s", (remaining, expected) => {
    expect(formatReplyCountdown(remaining)).toBe(expected);
  });
});
