import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { FocusFixture } from "./helpers/focus-fixture";
import { menuAction } from "./helpers/menu";
import { auditTask } from "./helpers/task-audit";
import { EVIDENCE } from "./helpers/evidence";

test("J/L: reopening yesterday's actual child reaches its same task and next-step note without rewriting the frozen work", async ({
  page,
  context,
}, info) => {
  test.setTimeout(60_000);
  const fx = await FocusFixture.create();
  const parent = await fx.task(),
    title = `Dünkü gerçek alt adım ${randomUUID().slice(-6)}`,
    renamed = `Bugünkü görev adı ${randomUUID().slice(-6)}`,
    text = `Sonraki küçük adım: aynı kayıttan devam ${randomUUID().slice(-6)}`,
    note = `Dönüş notu: aynı kayıttan devam ${randomUUID().slice(-6)}`;
  try {
    const childResponse = await fx.api.post(`/api/tasks/${parent.id}/children`, {
      data: { title, parentVersion: parent.version, parentWorkDisposition: "PreserveDirect" },
    });
    expect(childResponse.status()).toBe(201);
    const child = await childResponse.json();
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const workResponse = await fx.api.post("/api/work-sessions/manual", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        taskId: child.id,
        startedAt: `${date}T06:00:00Z`,
        endedAt: `${date}T06:20:00Z`,
        reason: "UI33 real historical manual work",
      },
    });
    expect(workResponse.status()).toBe(201);
    const work = await workResponse.json();
    // Sonraki adımı Gün Planlama Sıkıştım kaydeder. Tasarım gereği Notlar listesine girmez.
    const step = await fx.api.post("/api/notes", { data: { kind: "NextStep", text, taskId: child.id } });
    expect(step.status()).toBe(201);
    await fx.login(page);
    await page.goto("/notes");
    await page.getByRole("button", { name: "Not ekle", exact: true }).first().click();
    const form = page.getByRole("form", { name: "Yeni not", exact: true });
    await form.getByRole("textbox", { name: "Not", exact: true }).fill(note);
    await form.getByRole("button", { name: "Göreve bağla", exact: true }).click();
    const pick = page.getByRole("dialog", { name: "Göreve bağla", exact: true });
    await pick.getByRole("searchbox", { name: "Görev ara" }).fill(title);
    await pick.getByRole("button", { name: title, exact: true }).click();
    await form.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText(text)).toHaveCount(0);
    await menuAction(page, `Not işlemleri: ${note.slice(0, 40)}`, "İlgili görevi aç");
    await expect(page.getByLabel("Görev başlığı", { exact: true })).toHaveValue(title);
    await page.getByLabel("Görev başlığı", { exact: true }).fill(renamed);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("status").filter({ hasText: /^Kaydedildi$/ })).toBeVisible();
    await page.close();
    const reopened = await context.newPage();
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const privateReads: string[] = [];
    await reopened.route("**/api/auth/me", async route => {
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    reopened.on("request", request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/api/") && path !== "/api/auth/me") privateReads.push(path);
    });
    try {
      await reopened.goto("/work");
      await expect(reopened.getByRole("status").filter({ hasText: "Çalışma alanın açılıyor" })).toBeVisible();
      expect(privateReads).toEqual([]);
      release();
      await reopened.unrouteAll({ behavior: "wait" });
      const link = reopened.getByRole("link", { name: `Görevi aç: ${title}`, exact: true });
      await expect(link).toBeVisible();
      // Dokunmada 44px; farede 1024–1299px ölçeği (0.9) hedefi küçültür, en az 32px yeter.
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(
        info.project.name.startsWith("mobile") ? 44 : 32,
      );
      await link.focus();
      await reopened.keyboard.press("Enter");
      await expect(reopened.getByLabel("Görev başlığı", { exact: true })).toHaveValue(renamed);
      expect(new URL(reopened.url()).searchParams.get("taskId")).toBe(child.id);
      await reopened.getByRole("button", { name: /^Notlar/ }).click();
      await expect(reopened.getByText(note, { exact: true })).toBeVisible();
      await expect(reopened.getByText(text, { exact: true })).toHaveCount(0);
      expect((await (await fx.api.get(`/api/work-sessions/${work.id}`)).json()).taskAtStart).toEqual(work.taskAtStart);
      expect(
        (await (await fx.api.get(`/api/notes?taskId=${child.id}&kind=NextStep&limit=100`)).json()).items.some(
          (n: { kind: string; text: string; taskId: string }) =>
            n.kind === "NextStep" && n.text === text && n.taskId === child.id,
        ),
      ).toBe(true);
      await auditTask(reopened, "return-child-note", "integration");
      await reopened.screenshot({ path: `${EVIDENCE}/return-child-note-${info.project.name}.png`, fullPage: true });
    } finally {
      release();
      await reopened.unrouteAll({ behavior: "wait" });
    }
  } finally {
    await fx.clean();
    await fx.api.dispose();
  }
});
