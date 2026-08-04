import type { MetadataRoute } from "next";
import { getCachedProductRoutes } from "@/lib/catalog-cache";
import { SHOP_COLLECTION_PATHS } from "@/lib/catalog/collection-routes";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const staticRoutes = [
  "/",
  ...SHOP_COLLECTION_PATHS,
  "/system",
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
  const products = await getCachedProductRoutes().catch(() => []);
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
