import { expect, test } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { readWorkspace, type WorkspaceSnapshot } from "../../src/features/workspace/model";
import { updateDisplayPreferences, workspaceKey } from "../../src/features/workspace/queries";
import { readSnapshot } from "../../src/features/preferences/model";

const empty: WorkspaceSnapshot = {
  serverNow: "2026-10-25T06:00:00Z",
  planningVersion: "9007199254740993",
  versions: { planning: "9007199254740993", notes: 0, specialDays: 0 },
  activeWork: null,
  focusSessionId: null,
  focusIncluded: false,
  activeFocus: null,
  preferences: {
    version: 0,
    timeZoneId: "Europe/Istanbul",
    timeFormat: "24h",
    weekStartsOn: 1,
    supportEnabled: true,
    hasWorkingWindows: false,
    uiSupports: {
      calmView: false,
      dayBar: true,
      calibrationHints: true,
      nudges: true,
      resumeCard: true,
      openTodayAsOneThing: false,
    },
  },
};

test("the display snapshot preserves exact versions and verified empty work without a complete preferences document", () => {
  expect(readWorkspace(empty)).toBe(empty);
  expect(() => readSnapshot(empty.preferences as never)).toThrow();
  expect(readWorkspace({ ...empty, focusIncluded: true }).activeFocus).toBeNull();
});

test("missing, unsafe, malformed and inconsistent workspace fields fail closed", () => {
  const p = empty.preferences;
  const malformed = [
    null,
    {},
    { ...empty, serverNow: "2026-10-25" },
    { ...empty, planningVersion: 9007199254740992 },
    { ...empty, activeWork: undefined },
    { ...empty, focusSessionId: "invalid" },
    { ...empty, activeFocus: {} },
    { ...empty, focusIncluded: true, activeFocus: {} },
    ...[
      { version: -1 },
      { version: "9223372036854775808" },
      { timeZoneId: "invalid" },
      { weekStartsOn: 7 },
      { weekStartsOn: 1.5 },
      { timeFormat: "other" },
      { hasWorkingWindows: null },
      { uiSupports: { ...p.uiSupports, nudges: undefined } },
    ].map(patch => ({ ...empty, preferences: { ...p, ...patch } })),
  ];
  for (const value of malformed) expect(() => readWorkspace(value as WorkspaceSnapshot)).toThrow();
});

test("a settings write updates only an existing same-owner projection and never resets the work clock", async () => {
  const client = new QueryClient();
  client.setQueryData(workspaceKey("a"), empty);
  client.setQueryData(workspaceKey("b"), empty);
  const full = {
    version: 2,
    values: {
      timeZoneId: "UTC",
      timeFormat: "12h",
      weekStartsOn: 0,
      supportEnabled: false,
      weekly: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
      uiSupports: { ...empty.preferences.uiSupports, calmView: true },
    },
  };
  await updateDisplayPreferences(client, "a", full as never);
  const changed = client.getQueryData<WorkspaceSnapshot>(workspaceKey("a"))!;
  expect(changed.preferences.timeZoneId).toBe("UTC");
  expect(changed.preferences.hasWorkingWindows).toBe(true);
  expect(changed.serverNow).toBe(empty.serverNow);
  expect(changed.activeWork).toBe(empty.activeWork);
  expect(client.getQueryData(workspaceKey("b"))).toEqual(empty);
  expect(client.getQueryData(["user", "a", "preferences", {}])).toBeUndefined();
  await updateDisplayPreferences(client, "unmounted", full as never);
  expect(client.getQueryData(workspaceKey("unmounted"))).toBeUndefined();
});

test("an older in-flight snapshot cannot overwrite preferences from a successful settings write", async () => {
  const client = new QueryClient();
  const key = workspaceKey("a");
  client.setQueryData(key, empty);
  let release!: (value: WorkspaceSnapshot) => void;
  const flight = client
    .fetchQuery({
      queryKey: key,
      staleTime: 0,
      queryFn: () =>
        new Promise<WorkspaceSnapshot>(resolve => {
          release = resolve;
        }),
    })
    .catch(() => null);
  await updateDisplayPreferences(client, "a", {
    version: 3,
    values: {
      ...empty.preferences,
      weekly: [],
      timeZoneId: "UTC",
    },
  } as never);
  release(empty);
  await flight;
  expect(client.getQueryData<WorkspaceSnapshot>(key)!.preferences.timeZoneId).toBe("UTC");
  expect(client.getQueryData<WorkspaceSnapshot>(key)!.preferences.version).toBe(3);
});
