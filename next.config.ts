import type { NextConfig } from "next";
import { assertSupabaseTargetUrl, deploymentSupabaseTarget, supabaseOriginForTarget, verifyHostedSiteOrigins } from "./lib/supabase/project-safety";
import { verifyPublicSearchBinding } from "./lib/algolia/build-binding";
import { verifySupabaseCredential } from "./lib/supabase/key-binding";
import { CATALOG_MEDIA_BUCKET } from "./lib/catalog/media-storage";

const DAYS_PER_YEAR = 365;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * DAYS_PER_YEAR;
const IMMUTABLE_MEDIA_CACHE_CONTROL =
  `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
const HOME_VIDEO_PATHS = [
  "/media/home/helix-hero.webm",
  "/media/home/helix-hero.mp4",
  "/media/home/plug-and-play-loop.webm",
  "/media/home/plug-and-play-loop.mp4",
  "/media/home/final-cta-loop.webm",
  "/media/home/final-cta-loop.mp4",
] as const;

const target = deploymentSupabaseTarget(process.env);
verifyHostedSiteOrigins(process.env, target);
verifyPublicSearchBinding(process.env, target);
const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Reject swapped role-bearing values before Next can inline them in public JS.
if (publicUrl || publicKey || process.env.VERCEL === "1") {
  assertSupabaseTargetUrl(publicUrl ?? "", target);
  verifySupabaseCredential(publicKey ?? "", target, "anon", process.env);
}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_HELIX_SUPABASE_TARGET: target },
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/fonts/marcellus-latin.woff2", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] },
      ...HOME_VIDEO_PATHS.map((source) => ({
        source,
        headers: [
          {
            key: "Cache-Control",
            value: IMMUTABLE_MEDIA_CACHE_CONTROL,
          },
        ],
      })),
      {
        source: "/cart/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      ...["/reviews/guest", "/api/reviews/guest/:path*", "/checkout/success", "/api/checkout/status", "/email-preferences", "/marketing/consent", "/marketing/production/:path*", "/api/marketing/:path*", "/product-notifications", "/api/product-notifications/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      })),
    ];
  },
  async redirects() {
    return [
      {
        source: "/collections",
        destination: "/collections/shop",
        permanent: true,
      },
      {
        source: "/products",
        destination: "/collections/shop",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: new URL(supabaseOriginForTarget(target)).hostname,
        port: "",
        search: "",
        pathname: `/storage/v1/object/public/${CATALOG_MEDIA_BUCKET}/**`,
      },
    ],
  },
};

export default nextConfig;
