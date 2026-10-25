import { expect, it } from "vitest";
import { readResetCode } from "../../src/features/auth/reset-code";

it("extracts a single opaque hex code only from the fragment representation", () => {
  const code = "A".repeat(64);
  expect(readResetCode(`#?token=${code}`)).toBe(code);
  expect(readResetCode(`#token=${code}`)).toBe(code);
  for (const value of ["", "#", "#?token=short", `#?token=${"Z".repeat(64)}`, `#?token=${code}&token=${code}`])
    expect(readResetCode(value)).toBeNull();
});
