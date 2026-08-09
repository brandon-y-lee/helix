import { expect, test } from "./storefront-fixture";

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
