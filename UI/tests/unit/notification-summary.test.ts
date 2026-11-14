import { describe, expect, it } from "vitest";
import { readInboxSummary } from "../../src/features/notifications/badge";
import { readDeliveryStatus } from "../../src/features/notifications/model";
const summary = { unreadCount: 1240, asOf: "2026-11-11T03:00:00Z" };
describe("notification summary and delivery evidence", () => {
  it("accepts the full server count independently of inbox page size", () => {
    expect(readInboxSummary(summary).unreadCount).toBe(1240);
    expect(readInboxSummary({ ...summary, unreadCount: 0 }).unreadCount).toBe(0);
  });
  it("rejects malformed counts and timestamps before rendering the badge", () => {
    for (const unreadCount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, "1"])
      expect(() => readInboxSummary({ ...summary, unreadCount })).toThrow();
    expect(() => readInboxSummary({ ...summary, asOf: "bad" })).toThrow();
  });
  it("never invents a client display from a provider acknowledgement", () => {
    const provider = {
      snoozeCount: 0,
      preparedAt: summary.asOf,
      providerAcceptedAt: summary.asOf,
      clientDisplayedAt: null,
      clientOpenedAt: null,
      readAt: null,
    };
    expect(readDeliveryStatus(provider).clientDisplayedAt).toBeNull();
    expect(() => readDeliveryStatus({ ...provider, clientDisplayedAt: "bad" })).toThrow();
    expect(() => readDeliveryStatus({ ...provider, snoozeCount: -1 })).toThrow();
  });
});
