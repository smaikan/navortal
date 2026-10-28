import { expect, test } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readOverview, type DayOverview } from "../../src/features/planning/overview-model";
import { invalidateWorkspaceReads } from "../../src/features/workspace/invalidation";
import { workspaceKey } from "../../src/features/workspace/queries";

const date = "2026-10-25";
const empty: DayOverview = {
  recurringTaskIds: [],
  day: {
    id: null,
    localDate: date,
    timeZoneId: "Europe/Berlin",
    currentRevisionId: null,
    baselineRevisionId: null,
    version: 0,
    planningVersion: 1,
  },
  windowStartsAt: "2026-10-24T22:00:00Z",
  windowEndsAt: "2026-10-25T23:00:00Z",
  timed: { items: [], total: 0, offset: 0, limit: 100 },
  untimed: { items: [], total: 0, offset: 0, limit: 100 },
  glance: {
    localDate: date,
    workingRemainingSeconds: 0,
    plannedRemainingSeconds: 0,
    unknownEstimateCount: 0,
    unboundedItemCount: 0,
    completedItemCount: 0,
    openItemCount: 0,
    actualSeconds: 0,
    overCapacity: false,
    hints: [],
    planningVersion: 1,
    serverNow: "2026-10-25T06:00:00Z",
  },
  support: {
    localDate: date,
    timeZoneId: "Europe/Berlin",
    availableEnergy: null,
    criticalTaskIds: [],
    version: 0,
    planningVersion: 1,
    enabled: true,
  },
  versions: { planning: 1, notes: 0, specialDays: 0 },
};
const key = (owner = "a", name = "day-overview") => ["user", owner, name, { date }];

test("day overview preserves DST windows and rejects mismatched dates, pages and source versions", () => {
  expect(readOverview(empty, date)).toBe(empty);
  expect((Date.parse(empty.windowEndsAt) - Date.parse(empty.windowStartsAt)) / 3600000).toBe(25);
  for (const patch of [
    { day: { ...empty.day, localDate: "2026-10-24" } },
    { versions: { ...empty.versions, planning: 2 } },
    { versions: { ...empty.versions, notes: "9223372036854775808" } },
    { timed: { ...empty.timed, offset: 1 } },
    { untimed: { ...empty.untimed, limit: 25 } },
    { windowEndsAt: empty.windowStartsAt },
    { recurringTaskIds: undefined },
    { recurringTaskIds: ["00000000-0000-4000-8000-000000000001"] },
    { glance: { ...empty.glance, planningVersion: undefined } },
  ])
    expect(() => readOverview({ ...empty, ...patch } as DayOverview, date)).toThrow();
});

test("an unchanged fresh overview covers its widgets, while another owner is never refetched", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(workspaceKey("a"), { serverNow: empty.glance.serverNow, versions: empty.versions });
  let reads = 0;
  const observers = [key(), key("a", "plan-glance"), key("a", "support-day"), key("b")].map(queryKey => {
    client.setQueryData(queryKey, empty);
    const observer = new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: async () => {
        reads++;
        return empty;
      },
    });
    return observer.subscribe(() => {});
  });
  try {
    await invalidateWorkspaceReads(client, "a", () => true);
    expect(reads).toBe(0);
  } finally {
    observers.forEach(stop => stop());
    client.clear();
  }
});

test("notes or special-day changes invalidate an otherwise identical plan without widget duplicate reads", async () => {
  for (const resource of ["notes", "specialDays"] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(workspaceKey("a"), {
      serverNow: empty.glance.serverNow,
      versions: { ...empty.versions, [resource]: 1 },
    });
    client.setQueryData(key(), empty);
    let reads = 0;
    const observer = new QueryObserver(client, {
      queryKey: key(),
      queryFn: async () => {
        reads++;
        return { ...empty, versions: { ...empty.versions, [resource]: 1 } };
      },
      staleTime: Infinity,
    });
    const stop = observer.subscribe(() => {});
    try {
      await invalidateWorkspaceReads(client, "a", () => true);
      expect(reads).toBe(1);
    } finally {
      stop();
      client.clear();
    }
  }
});

test("a pending pre-subscription response cannot overwrite the catch-up read", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(workspaceKey("a"), {
    serverNow: empty.glance.serverNow,
    versions: { ...empty.versions, notes: 2 },
  });
  let release!: (v: DayOverview) => void,
    reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key(),
    queryFn: async () => {
      reads++;
      if (reads === 1)
        return new Promise<DayOverview>(resolve => {
          release = resolve;
        });
      return { ...empty, versions: { ...empty.versions, notes: 2 } };
    },
  });
  const stop = observer.subscribe(() => {});
  try {
    expect(reads).toBe(1);
    await invalidateWorkspaceReads(client, "a", () => true);
    expect(reads).toBe(2);
    release(empty);
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getQueryData<DayOverview>(key())!.versions.notes).toBe(2);
  } finally {
    stop();
    client.clear();
  }
});

test("only fresh source-certified assigned tasks and occurrences can skip catch-up", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const coverage = { serverNow: empty.glance.serverNow, versions: empty.versions };
  client.setQueryData(workspaceKey("a"), coverage);
  const cases = [
    { name: "tasks", filter: { assignedOn: date }, data: { coverage }, expected: 0 },
    { name: "task-picker", filter: { date }, data: { pages: [{ coverage }, { coverage }] }, expected: 0 },
    { name: "task-picker", filter: { date, search: "missing" }, data: { pages: [{ coverage }, {}] }, expected: 1 },
    {
      name: "task-picker",
      filter: { date, search: "changed" },
      data: { pages: [{ coverage }, { coverage: { ...coverage, versions: { ...empty.versions, planning: 0 } } }] },
      expected: 1,
    },
    {
      name: "task-picker",
      filter: { date, search: "old" },
      data: { pages: [{ coverage: { ...coverage, serverNow: "2026-10-25T05:00:00Z" } }] },
      expected: 1,
    },

    { name: "tasks", filter: { search: "other" }, data: { coverage }, expected: 1 },
    { name: "special-day-occurrences", filter: { from: date }, data: { coverage }, expected: 0 },
    { name: "focus-current", filter: {}, data: { coverage }, expected: 0 },
    { name: "tasks", filter: { assignedOn: date, purpose: "missing" }, data: {}, expected: 1 },
    {
      name: "tasks",
      filter: { assignedOn: date, purpose: "changed" },
      data: { coverage: { ...coverage, versions: { ...empty.versions, planning: 0 } } },
      expected: 1,
    },
    {
      name: "tasks",
      filter: { assignedOn: date, purpose: "old" },
      data: { coverage: { ...coverage, serverNow: "2026-10-25T05:00:00Z" } },
      expected: 1,
    },
    { name: "day-signals", filter: { date }, data: { coverage }, expected: 1 },
  ];
  const counts = cases.map(() => 0);
  const stops = cases.map((c, index) => {
    const queryKey = ["user", "a", c.name, c.filter];
    client.setQueryData(queryKey, c.data);
    const observer = new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: async () => {
        counts[index]++;
        return c.data;
      },
    });
    return observer.subscribe(() => {});
  });
  try {
    await invalidateWorkspaceReads(client, "a", () => true);
    expect(counts).toEqual(cases.map(c => c.expected));
  } finally {
    stops.forEach(stop => stop());
    client.clear();
  }
});

test("an initial certified page finishes without restart; a missed source change still refetches it", async () => {
  for (const version of [1, 2]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(workspaceKey("a"), {
      serverNow: empty.glance.serverNow,
      versions: { ...empty.versions, planning: version },
    });
    let release!: (data: unknown) => void,
      reads = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["user", "a", "tasks", { assignedOn: date }],
      queryFn: () => {
        reads++;
        return reads === 1
          ? new Promise(resolve => {
              release = resolve;
            })
          : Promise.resolve({
              coverage: { serverNow: empty.glance.serverNow, versions: { ...empty.versions, planning: version } },
            });
      },
    });
    const stop = observer.subscribe(() => {});
    try {
      const catchup = invalidateWorkspaceReads(client, "a", () => true);
      expect(reads).toBe(1);
      release({ coverage: { serverNow: empty.glance.serverNow, versions: empty.versions } });
      await catchup;
      expect(reads).toBe(version === 1 ? 1 : 2);
    } finally {
      stop();
      client.clear();
    }
  }
});

test("continuation validates independent offsets and the narrow unused list, never as a first-page DTO", () => {
  const scope = { scheduleOffset: 100, scheduleLimit: 100, itemOffset: 0, itemLimit: 1 };
  const page = { ...empty, timed: { ...empty.timed, offset: 100 }, untimed: { ...empty.untimed, limit: 1 } };
  expect(readOverview(page, date, scope)).toBe(page);
  expect(() => readOverview(page, date)).toThrow();
  expect(() => readOverview({ ...page, timed: { ...page.timed, offset: 0 } }, date, scope)).toThrow();
});

test("catch-up skips a bell count read near its snapshot but refreshes an older count", async () => {
  for (const [age, expected] of [
    [+1000, 0],
    [-1000, 0],
    [-20000, 1],
  ] as const) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(workspaceKey("a"), { serverNow: empty.glance.serverNow, versions: empty.versions });
    const snapshotAt = client.getQueryState(workspaceKey("a"))!.dataUpdatedAt;
    const badge = ["user", "a", "notifications", { kind: "badge" }];
    client.setQueryData(badge, [], { updatedAt: snapshotAt + age });
    let reads = 0;
    const observer = new QueryObserver(client, {
      queryKey: badge,
      queryFn: async () => {
        reads++;
        return [];
      },
      staleTime: Infinity,
    });
    const stop = observer.subscribe(() => {});
    try {
      await invalidateWorkspaceReads(client, "a", () => true);
      expect(reads).toBe(expected);
    } finally {
      stop();
      client.clear();
    }
  }
});
