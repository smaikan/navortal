import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../../src/features/auth/return-path";
import { isWorkspacePath } from "../../public/route-paths.js";

describe("notification login return path", () => {
  const path = "/notifications/11111111-1111-4111-8111-111111111111";
  it("preserves the exact notification across login", () => {
    expect(isWorkspacePath(path)).toBe(true);
    expect(safeReturnPath(path)).toBe(path);
  });
  it("rejects malformed, nested, external and encoded notification paths", () => {
    for (const value of [
      "/notifications/not-a-uuid",
      `${path}/extra`,
      `//evil.test${path}`,
      "/notifications/%2f%2fevil.test",
    ]) {
      expect(safeReturnPath(value)).toBe("/planning");
    }
  });
  it("preserves existing web push query links", () => {
    expect(safeReturnPath("/notifications?notificationId=11111111-1111-4111-8111-111111111111")).toBe(
      "/reminders?notificationId=11111111-1111-4111-8111-111111111111",
    );
  });
});
