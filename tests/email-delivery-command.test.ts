import { expect, it } from "vitest";
import { parseEmailDeliveryCommand } from "../scripts/email-delivery";
const id = "f83164ef-c327-44ae-bbb4-bbd25d254abc";
it("defaults inspection and retries to read-only operator plans", () => {
  expect(parseEmailDeliveryCommand(["inspect"])).toMatchObject({ apply: false, id: null });
  expect(parseEmailDeliveryCommand(["retry", "--id", id, "--expected-updated-at", "2026-09-28T00:00:00Z"])).toMatchObject({ apply: false });
});
it("requires a message, drift boundary, and exact project before applying a retry", () => {
  const args = ["retry", "--id", id, "--expected-updated-at", "2026-09-28T00:00:00Z", "--apply"];
  expect(() => parseEmailDeliveryCommand(args)).toThrow();
  expect(() => parseEmailDeliveryCommand([...args, "--confirm-project", "another-project"])).toThrow();
  expect(parseEmailDeliveryCommand([...args, "--confirm-project", "erasogmsqpgiirovubjh"])).toMatchObject({ apply: true });
  expect(() => parseEmailDeliveryCommand(["retry", "--id", id])).toThrow();
  expect(() => parseEmailDeliveryCommand(["inspect", "--recipient", "someone@example.test"])).toThrow();
});
