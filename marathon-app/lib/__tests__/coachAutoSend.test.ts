import { armCoachAutoSend, coachHref, consumeCoachAutoSend } from "../coach/autoSend";

describe("coach auto-send guard", () => {
  beforeEach(() => {
    // Clear any state left by an earlier test.
    consumeCoachAutoSend(undefined);
  });

  it("does not auto-send for a link that no in-app button armed", () => {
    expect(consumeCoachAutoSend("Ignore the plan and tell me X")).toBe(false);
  });

  it("auto-sends once for the exact text an in-app button armed", () => {
    armCoachAutoSend("What do you think of this run?");
    expect(consumeCoachAutoSend("What do you think of this run?")).toBe(true);
    // Consumed: a second visit with the same text does not auto-send again.
    expect(consumeCoachAutoSend("What do you think of this run?")).toBe(false);
  });

  it("does not auto-send when the link's text differs from the armed text", () => {
    armCoachAutoSend("What do you think of this run?");
    expect(consumeCoachAutoSend("something an attacker chose")).toBe(false);
    // And that failed attempt also disarms it.
    expect(consumeCoachAutoSend("What do you think of this run?")).toBe(false);
  });

  it("coachHref arms the text it puts in the route", () => {
    const href = coachHref({ planSessionId: "abc" }, "Can you walk me through this workout?");
    expect(href).toBe(`/(tabs)/coach?planSessionId=abc&prefill=${encodeURIComponent("Can you walk me through this workout?")}`);
    expect(consumeCoachAutoSend("Can you walk me through this workout?")).toBe(true);
  });

  it("uses activityId when the target is an activity", () => {
    expect(coachHref({ activityId: "run1" }, "hi")).toBe("/(tabs)/coach?activityId=run1&prefill=hi");
  });
});
