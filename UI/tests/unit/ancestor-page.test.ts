import { expect, it } from "vitest";
import type { Task } from "../../src/features/tasks/model";
import { readAncestorPage, type AncestorCursor } from "../../src/features/tasks/relations/ancestor-page";

// Okuyucu yalnız kimlik/üstü kullanır. API Task çözümleme ayrıca test edilir.
const node = (id: string, parentTaskId: string | null) => ({ id, parentTaskId }) as Task;
const cursor = (nextId = "1"): AncestorCursor => ({ nextId, visitedIds: ["leaf"] });

it("bounds each explicit continuation to sixteen reads", async () => {
  const reads: string[] = [];
  const page = await readAncestorPage(cursor(), async id => {
    reads.push(id);
    return node(id, String(Number(id) + 1));
  });
  expect(reads).toEqual(Array.from({ length: 16 }, (_, i) => String(i + 1)));
  expect(page.items.map(item => item.id)).toEqual(reads);
  expect(page.next).toEqual({ nextId: "17", visitedIds: ["leaf", ...reads] });
});

it("continues beyond 128 ancestors without duplicates or a logical depth cap", async () => {
  const reads: string[] = [];
  let next: AncestorCursor | undefined = cursor();
  let pages = 0;
  while (next) {
    const page = await readAncestorPage(next, async id => {
      reads.push(id);
      return node(id, id === "129" ? null : String(Number(id) + 1));
    });
    expect(page.items.length).toBeLessThanOrEqual(16);
    next = page.next;
    pages++;
  }
  expect(pages).toBe(9);
  expect(reads).toEqual(Array.from({ length: 129 }, (_, i) => String(i + 1)));
});

it("detects a cycle across page boundaries before reading a visited task again", async () => {
  const read = async (id: string) => node(id, id === "17" ? "1" : String(Number(id) + 1));
  const first = await readAncestorPage(cursor(), read);
  const reads: string[] = [];
  await expect(
    readAncestorPage(first.next!, async id => {
      reads.push(id);
      return read(id);
    }),
  ).rejects.toThrow("döngü");
  expect(reads).toEqual(["17"]);
});

it("stops continuation after an in-flight read when its observer aborts", async () => {
  const controller = new AbortController();
  const reads: string[] = [];
  await expect(
    readAncestorPage(
      cursor(),
      async id => {
        reads.push(id);
        controller.abort();
        return node(id, "2");
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(reads).toEqual(["1"]);
  await expect(
    readAncestorPage(
      cursor(),
      async id => {
        reads.push(id);
        return node(id, null);
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(reads).toEqual(["1"]);
});

it("rejects a response for another task instead of displaying a false path", async () => {
  await expect(readAncestorPage(cursor(), async () => node("foreign", null))).rejects.toThrow("başka bir kayda");
});
