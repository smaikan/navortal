import { test } from "node:test";
import assert from "node:assert/strict";
import { isAbsolute, join, resolve } from "node:path";
import { resolveEvidenceDirectory } from "./ci-evidence.mjs";

const workspace = resolve("ci-workspace");
const ui = join(workspace, "UI");

test("legacy evidence path resolves to an absolute upload path without parent segments", () => {
  const result = resolveEvidenceDirectory(workspace, ui, "../UI-docs/verification/notes-r");
  assert.equal(result, join(workspace, "UI-docs", "verification", "notes-r"));
  assert.equal(isAbsolute(result), true);
  assert.equal(result.split(/[\\/]/).includes(".."), false);
});

test("CI override keeps all browser tiers in one disposable artifact directory", () => {
  const result = resolveEvidenceDirectory(workspace, ui, ".local/ci-evidence");
  for (const tier of ["chromium-mobile", "webkit-critical", "firefox-critical"]) {
    assert.equal(resolveEvidenceDirectory(workspace, ui, `.local/ci-evidence/${tier}`), join(result, tier));
  }
});

test("an already absolute workspace path is preserved", () => {
  const result = join(workspace, "evidence");
  assert.equal(resolveEvidenceDirectory(workspace, ui, result), result);
});

test("empty paths, environment-file injection and paths outside the checkout are refused", () => {
  for (const configured of ["", " ", "../..", "..", ".local/evidence\nOTHER=value", ".local/evidence\rOTHER=value"]) {
    assert.throws(() => resolveEvidenceDirectory(workspace, ui, configured));
  }
});
