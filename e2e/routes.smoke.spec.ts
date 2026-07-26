import { expect, test } from "@playwright/test";

test("critical storefront routes render their primary content", async ({
  page,
}) => {
  const routes: ReadonlyArray<{ path: string; heading: string }> = [
    { path: "/", heading: "Your skin starts with three steps." },
    { path: "/products", heading: "RAISE YOUR BASELINE." },
    {
      path: "/products/treat-03-pdrn-5-ampoule",
      heading: "TREAT",
    },
    { path: "/system", heading: "THE SYSTEM." },
    { path: "/cart", heading: "Cart" },
    { path: "/checkout", heading: "Checkout" },
  ];

  for (const route of routes) {
    const response = await page.goto(route.path);
    expect(response?.ok(), `${route.path} should return 2xx`).toBe(true);
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading }),
    ).toBeVisible();
  }
});
