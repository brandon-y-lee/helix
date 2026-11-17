import { expect, test } from "./storefront-fixture";

// Actual canonical browser origin, but every request is intercepted. Only local
// built page/static artifacts are fetched; no production/provider request escapes.
for (const width of [1440, 390]) {
  test(`canonical support transport remains contained at ${width}px`, async ({
    page,
    request,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Built verification base URL required");
    await page.setViewportSize({ width, height: 900 });
    const canonical = "https://www.helixskin.us";
    const storage = "https://abcdefghijklmnopqrst.supabase.co";
    const bucket = "support-production-private";
    const inquiryId = "00000000-0000-4000-8000-000000000001";
    let submitted:
      | {
          submissionId: string;
          uploadCapability: string;
          photos: { uploadId: string }[];
        }
      | undefined;
    let puts = 0;
    const legacy: string[] = [];
    await page.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (
        url.origin === canonical &&
        url.pathname === "/api/support/production/intake"
      ) {
        if (req.method() === "GET")
          return route.fulfill({
            json: {
              available: true,
              photosAvailable: true,
              uploadBinding: { origin: storage, bucket },
            },
          });
        submitted = req.postDataJSON();
        return route.fulfill({
          json: {
            ok: true,
            receipt: {
              inquiryId,
              submissionId: submitted!.submissionId,
              status: "saved",
            },
          },
        });
      }
      if (
        url.origin === canonical &&
        url.pathname === "/api/support/production/photos"
      ) {
        const data = req.postDataJSON();
        expect(data.submissionId).toBe(submitted?.submissionId);
        expect(data.uploadCapability).toBe(submitted?.uploadCapability);
        if (data.action === "admit")
          return route.fulfill({
            json: {
              ok: true,
              uploadId: data.uploadId,
              uploadUrl: `${storage}/storage/v1/object/upload/sign/${bucket}/raw/${inquiryId}/${data.uploadId}?token=synthetic`,
            },
          });
        if (data.action === "complete")
          return route.fulfill({ json: { ok: true } });
        return route.fulfill({
          json: {
            ok: true,
            primaryHandoff: "provider_accepted",
            photos: submitted!.photos.map(({ uploadId }) => ({
              uploadId,
              status: "ready",
              handoff: "unconfirmed",
            })),
          },
        });
      }
      if (url.origin === storage) {
        const headers = {
          "access-control-allow-origin": canonical,
          "access-control-allow-methods": "PUT, OPTIONS",
          "access-control-allow-headers": "content-type, x-upsert",
        };
        if (req.method() === "OPTIONS")
          return route.fulfill({ status: 204, headers });
        expect(req.method()).toBe("PUT");
        expect(url.pathname).toBe(
          `/storage/v1/object/upload/sign/${bucket}/raw/${inquiryId}/${submitted!.photos[0].uploadId}`,
        );
        puts++;
        return route.fulfill({ status: 200, headers, body: "{}" });
      }
      if (url.origin === canonical && url.pathname.startsWith("/api/support/"))
        legacy.push(url.pathname);
      if (
        url.origin === canonical &&
        req.method() === "GET" &&
        (url.pathname === "/contact" ||
          url.pathname.startsWith("/_next/") ||
          /\.(?:woff2?|svg|png|ico)$/.test(url.pathname))
      ) {
        const local = new URL(url.pathname + url.search, baseURL);
        const artifact = await request.get(local.href, { maxRedirects: 0 });
        expect(artifact.status()).toBeLessThan(300);
        return route.fulfill({ response: artifact });
      }
      return route.abort("blockedbyclient");
    });
    await page.goto(`${canonical}/contact`);
    await page
      .getByRole("textbox", { name: "First and last name", exact: true })
      .fill("Synthetic Support Test");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill("synthetic@example.test");
    await page
      .getByRole("textbox", { name: "Topic", exact: true })
      .fill("Synthetic photo test");
    await page
      .getByRole("textbox", { name: "Tell us the details", exact: true })
      .fill("Inert browser fixture only, no delivery.");
    await page.getByLabel("Photos (optional)").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic fixture, not a decoder proof"),
    });
    expect(puts).toBe(0);
    await page
      .getByRole("button", { name: "Submit inquiry", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Inquiry received", exact: true }),
    ).toBeFocused();
    await expect.poll(() => puts).toBe(1);
    expect(submitted?.uploadCapability).toMatch(/^[a-f0-9]{64}$/);
    await page
      .getByRole("button", { name: "Check photo status", exact: true })
      .click();
    await expect(
      page.getByText(
        "Photo checked and saved privately; email handoff is not yet confirmed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Inbox delivery has not been independently confirmed/),
    ).toBeVisible();
    expect(legacy).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
