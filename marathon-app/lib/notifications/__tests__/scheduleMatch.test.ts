import { isSendHourNow } from "../scheduleMatch";

describe("isSendHourNow", () => {
  it("matches when the user's local hour equals their preference", () => {
    // 2026-09-09T11:00:00Z is 07:00 in America/New_York (UTC-4 in September, DST).
    const now = new Date("2026-09-09T11:00:00Z");
    expect(isSendHourNow("America/New_York", 7, now)).toBe(true);
  });

  it("does not match a different hour", () => {
    const now = new Date("2026-09-09T11:00:00Z");
    expect(isSendHourNow("America/New_York", 8, now)).toBe(false);
  });

  it("handles a timezone far ahead of UTC crossing midnight", () => {
    // 2026-09-10T01:30:00Z is 07:00 the same day in Asia/Kolkata (UTC+5:30).
    const now = new Date("2026-09-10T01:30:00Z");
    expect(isSendHourNow("Asia/Kolkata", 7, now)).toBe(true);
  });

  it("handles a timezone behind UTC", () => {
    // 2026-09-09T14:00:00Z is 07:00 in America/Los_Angeles (UTC-7 in September, DST).
    const now = new Date("2026-09-09T14:00:00Z");
    expect(isSendHourNow("America/Los_Angeles", 7, now)).toBe(true);
  });
});
