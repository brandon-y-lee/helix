import type { MetadataRoute } from "next";
import { getCachedProducts } from "@/lib/catalog-cache";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const staticRoutes = [
  "/",
  "/products",
  "/method",
  "/about",
  "/cart",
  "/checkout",
  "/account",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/privacy-choices",
  "/accessibility",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getCachedProducts().catch(() => []);
  const now = new Date();

  return [
    ...staticRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: now,
    })),
    ...products.map((product) => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: now,
    })),
  ];
}
