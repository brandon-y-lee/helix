import { expect, type Locator } from "@playwright/test";

export async function expectStableIdentityLayout(identity: Locator) {
  const initialBox = await identity.boundingBox();
  await identity.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const settledBox = await identity.boundingBox();

  expect(initialBox).not.toBeNull();
  expect(settledBox).not.toBeNull();
  expect(settledBox!.x).toBeCloseTo(initialBox!.x, 1);
  expect(settledBox!.y).toBeCloseTo(initialBox!.y, 1);
  expect(settledBox!.width).toBeCloseTo(initialBox!.width, 1);
  expect(settledBox!.height).toBeCloseTo(initialBox!.height, 1);
}
