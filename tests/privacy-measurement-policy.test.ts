import { expect, it } from "vitest";
import { measurementContext } from "@/lib/privacy/measurement-policy";
const origin = "https://helixskin.vercel.app";
it("allows only clean public contexts and rejects private URLs/referrers and unverified products", () => {
  expect(measurementContext(`${origin}/system`, "", "", origin)).toEqual({
    url: `${origin}/system`,
    path: "/system",
    route: "/system",
    title: "Helix — System",
  });
  for (const path of [
    "/account",
    "/admin",
    "/cart",
    "/checkout/success?session_id=private",
    "/auth/confirm?token_hash=private",
    "/search?q=private",
    "/contact?email=private",
    "/#private",
    "/email-preferences",
    "/helix-verification/customer/order",
    "/products/arbitrary",
  ]) {
    expect(measurementContext(`${origin}${path}`, "", "", origin)).toBeNull();
  }
  expect(
    measurementContext(
      `${origin}/products/super-serum`,
      "",
      `${origin}/products/super-serum`,
      origin,
    )?.route,
  ).toBe("/products/[slug]");
  expect(
    measurementContext(`${origin}/`, `${origin}/account`, "", origin),
  ).toBeNull();
  expect(
    measurementContext(
      `${origin}/`,
      "https://google.com/?q=private",
      "",
      origin,
    ),
  ).toBeNull();
  expect(
    measurementContext("http://localhost:3102/", "", "", origin),
  ).toBeNull();
});
