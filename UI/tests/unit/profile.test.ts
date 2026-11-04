import { describe, expect, it } from "vitest";
import { readProfile, validPhoto, profileName } from "../../src/features/preferences/profile-model";
import { readSettingsView } from "../../src/features/preferences/settings-url";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "reader@example.test",
  displayName: "Deniz Yılmaz",
  profileVersion: 3,
  photoVersion: null,
};
describe("profile boundaries", () => {
  it("accepts the server profile without inventing photo or name data", () => {
    const read = readProfile({ user, photoUploadEnabled: true, firstName: "Deniz", lastName: "Yılmaz" });
    expect(read.user).toEqual(user);
    expect([read.firstName, read.lastName]).toEqual(["Deniz", "Yılmaz"]);
    expect(profileName(user)).toBe("Deniz Yılmaz");
    expect(profileName({ ...user, displayName: user.email })).toBe("");
  });
  it.each([
    null,
    {},
    { user },
    { user: { ...user, profileVersion: 0 }, photoUploadEnabled: true, firstName: "", lastName: "" },
    { user: { ...user, profileVersion: Number.MAX_SAFE_INTEGER + 1 }, photoUploadEnabled: true },
    { user: { ...user, photoVersion: "https://foreign.example.test/a.jpg" }, photoUploadEnabled: true },
    // Ad ve soyad sunucu sözleşmesinde her zaman metindir; eksikse profil okunmaz.
    { user, photoUploadEnabled: true, lastName: "" },
    { user, photoUploadEnabled: true, firstName: "Deniz", lastName: null },
  ])("rejects incomplete or unsafe server data", value => {
    expect(() => readProfile(value)).toThrow("Profil bilgileri okunamadı.");
  });
  it("allows only bounded raster image files; SVG, oversized and empty files stay local", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(validPhoto({ type, size: 2 * 1024 * 1024 })).toBe(true);
    for (const file of [
      { type: "image/png", size: 0 },
      { type: "image/png", size: 2 * 1024 * 1024 + 1 },
      { type: "image/svg+xml", size: 100 },
    ])
      expect(validPhoto(file)).toBe(false);
  });
});

describe("settings window address", () => {
  it("opens only known sections; unknown values fall back to profile and the phone list stays explicit", () => {
    expect(readSettingsView(null)).toBeNull();
    expect(readSettingsView("hours")).toBe("hours");
    expect(readSettingsView("menu")).toBe("menu");
    expect(readSettingsView("not-a-section")).toBe("profile");
    expect(readSettingsView("special-days")).toBe("profile");
  });
});
