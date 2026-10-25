import { describe, expect, it } from "vitest";
import { surfaceClass } from "../../src/components/ui/surface";

describe("surface placement", () => {
  it("keeps the side panel as the default sheet and maps every placement to its CSS class", () => {
    expect(surfaceClass("side")).toBe("workspace-surface modal-surface");
    expect(surfaceClass("center")).toBe("workspace-surface modal-surface modal-center");
    // Geniş pencere orta pencerenin telefonda tam ekran kuralını da alır.
    expect(surfaceClass("center-wide")).toBe("workspace-surface modal-surface modal-center modal-wide");
    // Onay penceresi alttan sayfa veya tam ekran sınıflarını almaz; telefonda da ortada kalır.
    expect(surfaceClass("confirm")).toBe("workspace-surface modal-surface modal-confirm");
    expect(surfaceClass("full")).toBe("workspace-surface modal-surface modal-full");
  });
});
