import { expect, test } from "@playwright/test";

test("footer exposes essential navigation and legal links on public routes", async ({
  page,
}) => {
  for (const path of ["/", "/products/treat-03-pdrn-5-ampoule"]) {
    await page.goto(path);
    const footer = page.locator("#site-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/products",
    );
    await expect(
      footer.getByRole("link", { name: "Privacy", exact: true }),
    ).toHaveAttribute("href", "/privacy");
    await expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(footer.getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/faq",
    );
  }
});

test("all internal footer destinations return a successful response", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const hrefs = await page.locator("#site-footer a[href^='/']").evaluateAll(
    (links) =>
      Array.from(
        new Set(
          links
            .map((link) => link.getAttribute("href"))
            .filter((href): href is string => Boolean(href)),
        ),
      ),
  );
  expect(hrefs.length).toBeGreaterThan(8);

  for (const href of hrefs) {
    const path = href.split("#")[0] || "/";
    const response = await request.get(path);
    expect(response.status(), `${href} should resolve`).toBeLessThan(400);
  }
});

test("mobile footer controls are keyboard operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = page.locator("#site-footer");
  const navigate = footer.getByRole("button", { name: "Navigate" });
  await navigate.focus();
  await page.keyboard.press("Enter");
  await expect(navigate).toHaveAttribute("aria-expanded", "true");
  await expect(
    footer
      .locator(".site-footer__mobile-groups")
      .getByRole("link", { name: "Shop" }),
  ).toBeVisible();

  const preferences = footer.getByRole("button", {
    name: "Cookie Preferences",
  });
  await preferences.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Cookie Preferences" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Essential cookies");
  await dialog
    .getByRole("button", { name: "Save current preference" })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Current preference saved.",
  );
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
});
