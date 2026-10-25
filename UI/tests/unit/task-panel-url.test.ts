import { describe, expect, it } from "vitest";
import { taskPanelUrl, validTaskId } from "../../src/components/layout/task-panel-url";

describe("task selection URL context", () => {
  it("preserves filters, date, pagination and fragment on open and close", () => {
    const query = "date=2026-10-17&q=Türkçe+uzun+iş&page=3&taskId=old&taskId=duplicate";
    const url = taskPanelUrl("/tasks", query, "id", "#liste");
    expect(url).toBe("/tasks?date=2026-10-17&q=T%C3%BCrk%C3%A7e+uzun+i%C5%9F&page=3&taskId=id#liste");
    expect(taskPanelUrl("/planning", "taskId=old", null)).toBe("/planning");
  });
  it("rejects malformed identifiers rather than claiming a task exists", () => {
    expect(validTaskId("00000000-0000-0000-0000-000000000001")).toBe(true);
    for (const value of ["", "javascript:alert(1)", "../", "<script>", "00000000-0000-0000-0000-000000000001suffix"])
      expect(validTaskId(value)).toBe(false);
  });
});
