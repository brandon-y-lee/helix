import { expect, test } from "@playwright/test";

const footerPages = [
  "/",
  "/products",
  "/products/recode-03-pdrn-5-ampoule",
  "/method",
  "/about",
  "/privacy-policy",
  "/terms-of-service",
  "/cookie-policy",
  "/privacy-choices",
  "/accessibility",
  "/faq",
  "/contact",
] as const;

test("global footer renders across public routes without unsupported links", async ({
  page,
}) => {
  for (const route of footerPages) {
    await page.goto(route);
    await expect(page.locator(".site-footer")).toBeVisible();
    await expect(page.locator(".site-footer").getByRole("heading", { name: "MEI-PELLE" })).toBeVisible();
    await expect(page.locator(".site-footer")).toContainText("EMAIL UPDATES COMING SOON");
    await expect(page.locator(".site-footer a[href='/privacy-policy']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer a[href='/privacy-choices']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Store Locator" })).toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Events" })).toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Instagram" })).toHaveCount(0);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});

test("all internal footer links resolve", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator(".site-footer a[href^='/']").evaluateAll((links) =>
    Array.from(new Set(links.map((link) => link.getAttribute("href")).filter(Boolean))),
  );

  expect(hrefs.length).toBeGreaterThan(8);

  for (const href of hrefs) {
    const response = await page.goto(href as string);
    expect(response?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("mobile footer accordions and cookie preferences are keyboard reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = page.locator(".site-footer");
  const navigate = footer.getByRole("button", { name: "Navigate" });
  await expect(navigate).toHaveAttribute("aria-expanded", "false");
  await navigate.click();
  await expect(navigate).toHaveAttribute("aria-expanded", "true");
  await expect(
    footer.locator(".site-footer__mobile-groups").getByRole("link", { name: "Shop" }),
  ).toBeVisible();

  await footer.getByRole("button", { name: "Cookie Preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie Preferences" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Essential cookies");
  await dialog.getByRole("button", { name: "Save essential preference" }).click();
  await expect(dialog.getByRole("status")).toContainText("Essential-only preference saved.");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
});

test("FAQ accordions and contact validation reflect current functionality", async ({
  page,
}) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { level: 1, name: "FAQ" })).toBeVisible();
  await page.getByRole("button", { name: "Is checkout currently available?" }).click();
  await expect(page.getByText("Checkout is a development placeholder.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("returns are accepted");

  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1, name: "CONTACT" })).toBeVisible();
  await page.getByRole("button", { name: "Check message" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("No message was sent");

  await page.getByLabel("Name").fill("Alex Morgan");
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByLabel("Inquiry type").selectOption("privacy");
  await page.getByLabel("Subject").fill("Privacy request");
  await page
    .getByLabel("Message")
    .fill("I would like to understand what account data is currently stored.");
  await page.getByRole("button", { name: "Check message" }).click();
  await expect(page.getByRole("status")).toContainText("No message was sent or stored");
  await expect(page.getByText("Message sent successfully")).toHaveCount(0);
});
