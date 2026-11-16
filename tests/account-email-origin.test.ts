import { afterEach, expect, it, vi } from "vitest";
import { accountEmailOrigin } from "@/lib/auth/email-confirmation";

afterEach(() => vi.unstubAllEnvs());

it.each([
  "https://attacker.example",
  "https://helixskin.us/",
  "https://user:password@helixskin.us",
  "https://helixskin.us:8443",
])("fails closed for an unreviewed account email origin: %s", (origin) => {
  vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", origin);
  expect(() => accountEmailOrigin()).toThrow("Invalid account email origin.");
});

it("ignores a hostile incoming callback host when selecting a redirect", () => {
  vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://www.helixskin.us");
  expect(accountEmailOrigin("https://attacker.example")).toBe("https://www.helixskin.us");
});
