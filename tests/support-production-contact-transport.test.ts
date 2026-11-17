// @vitest-environment node
import { expect, it } from "vitest";
import {
  contactTransport,
  validateUploadDestination,
  productionCapability,
  photoHandoffMessage,
} from "@/lib/support/contact-transport";
it("canonical production never chooses legacy even without configuration", () => {
  expect(contactTransport("https://www.helixskin.us").intake).toBe(
    "/api/support/production/intake",
  );
  expect(contactTransport("https://helixskin.us").intake).toBe(
    "/api/support/production/intake",
  );
  expect(contactTransport("http://localhost:3000").intake).toBe(
    "/api/support/intake",
  );
  expect(productionCapability()).toMatch(/^[a-f0-9]{64}$/);
});
it("requires the exact server-selected bucket/inquiry/upload path and no foreign token parameters", () => {
  const binding = {
    origin: "https://abcdefghijklmnopqrst.supabase.co",
    bucket: "support-production-private",
  };
  const id = "00000000-0000-4000-8000-000000000001";
  const url = `${binding.origin}/storage/v1/object/upload/sign/${binding.bucket}/raw/${id}/${id}?token=opaque`;
  expect(validateUploadDestination(url, binding, id, id)).toBe(url);
  for (const bad of [
    url.replace(binding.origin, "https://attacker.invalid"),
    url.replace("/raw/", "/clean/"),
    url + "&redirect=elsewhere",
    url + "#fragment",
    url.replace(binding.bucket, "helix-support-photos"),
  ])
    expect(() => validateUploadDestination(bad, binding, id, id)).toThrow();
});

it("distinguishes checked photos from unconfirmed or review-required email handoff", () => {
  expect(photoHandoffMessage("queued")).toContain("handoff is pending");
  expect(photoHandoffMessage("unconfirmed")).toContain("not yet confirmed");
  expect(photoHandoffMessage("needs_review")).toContain("needs review");
  expect(photoHandoffMessage("provider_accepted")).toContain(
    "Inbox delivery is not confirmed",
  );
});
